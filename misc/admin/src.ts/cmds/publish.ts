import AWS from 'aws-sdk';

import { getOrdered } from "../depgraph";
import { getGitTag } from "../git";
import * as local from "../local";
import { colorify, getProgressBar } from "../log";
import * as npm from "../npm";
import { resolve } from "../path";
import { loadJson, repeat } from "../utils";

const USER_AGENT = "ethers-dist@0.0.1";
const TAG = "latest";

(async function() {
    const dirnames = getOrdered();

    // @TODO: Fail if there are any untracked files or unchecked in files

    const publish: Record<string, { name: string, gitHead: string, newVersion: string }> = { };

    const progressUpdate = getProgressBar(colorify.bold("Finding updated packages..."));
    for (let i = 0; i < dirnames.length; i++) {
        progressUpdate(i / dirnames.length);

        let dirname = dirnames[i];

        let info = local.getPackage(dirname);

        // Get the latest commit this package was modified at
        const path = resolve("packages", dirname);
        const gitHead = await getGitTag(path);
        if (gitHead == null) { throw new Error("hmmm..."); }

        publish[dirname] = {
            name: info.name,
            gitHead: gitHead,
            newVersion: info.version
        };
    }
    progressUpdate(1);

    console.log(colorify.bold(`Found ${ Object.keys(publish).length } updated pacakges...`));
    Object.keys(publish).forEach((dirname) => {
        const info = publish[dirname];
        console.log(`  ${ colorify.blue(info.name) } ${ repeat(" ", 50 - info.name.length) } ${ colorify.bold("=>") } ${ colorify.green(info.newVersion) }`);
    });

    const publishNames = Object.keys(publish);
    publishNames.sort((a, b) => (dirnames.indexOf(a) - dirnames.indexOf(b)));

    const options: Record<string, string> = {
        access: "public",
        npmVersion: USER_AGENT,
        tag: TAG,
        registry: "https://git.energy/api/v4/projects/195/packages/npm/",
        "//git.energy/api/v4/projects/195/packages/npm/:_authToken": process.env.REGISTERY_TOKEN
    };

    console.log(colorify.bold("Publishing:"));
    for (let i = 0; i < publishNames.length; i++) {
        const dirname = publishNames[i];
        const path = resolve("packages", dirname);
        const pathJson = resolve("packages", dirname, "package.json");

        const { gitHead, name, newVersion } = publish[dirname];
        console.log(`  ${ colorify.blue(name) } @ ${ colorify.green(newVersion) }`);

        local.updateJson(pathJson, { gitHead: gitHead }, true);
        const info = loadJson(pathJson);
        await npm.publish(path, info, options);
        local.updateJson(pathJson, { gitHead: undefined }, true);
    }
})();
