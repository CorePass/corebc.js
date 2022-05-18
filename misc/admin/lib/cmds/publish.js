"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidate = exports.putObject = void 0;
const depgraph_1 = require("../depgraph");
const git_1 = require("../git");
const local = __importStar(require("../local"));
const log_1 = require("../log");
const npm = __importStar(require("../npm"));
const path_1 = require("../path");
const utils_1 = require("../utils");
const USER_AGENT = "ethers-dist@0.0.1";
const TAG = "latest";
function putObject(s3, info) {
    return new Promise((resolve, reject) => {
        s3.putObject(info, function (error, data) {
            if (error) {
                reject(error);
            }
            else {
                resolve({
                    name: info.Key,
                    hash: data.ETag.replace(/"/g, '')
                });
            }
        });
    });
}
exports.putObject = putObject;
function invalidate(cloudfront, distributionId) {
    return new Promise((resolve, reject) => {
        cloudfront.createInvalidation({
            DistributionId: distributionId,
            InvalidationBatch: {
                CallerReference: `${USER_AGENT}-${parseInt(String((new Date()).getTime() / 1000))}`,
                Paths: {
                    Quantity: 1,
                    Items: [
                        "/\*"
                    ]
                }
            }
        }, function (error, data) {
            if (error) {
                console.log(error);
                return;
            }
            resolve(data.Invalidation.Id);
        });
    });
}
exports.invalidate = invalidate;
(function () {
    return __awaiter(this, void 0, void 0, function* () {
        const dirnames = (0, depgraph_1.getOrdered)();
        // @TODO: Fail if there are any untracked files or unchecked in files
        const publish = {};
        const progressUpdate = (0, log_1.getProgressBar)(log_1.colorify.bold("Finding updated packages..."));
        for (let i = 0; i < dirnames.length; i++) {
            progressUpdate(i / dirnames.length);
            let dirname = dirnames[i];
            let info = local.getPackage(dirname);
            // Get the latest commit this package was modified at
            const path = (0, path_1.resolve)("packages", dirname);
            const gitHead = yield (0, git_1.getGitTag)(path);
            if (gitHead == null) {
                throw new Error("hmmm...");
            }
            publish[dirname] = {
                name: info.name,
                gitHead: gitHead,
                newVersion: info.version
            };
        }
        progressUpdate(1);
        console.log(log_1.colorify.bold(`Found ${Object.keys(publish).length} updated pacakges...`));
        Object.keys(publish).forEach((dirname) => {
            const info = publish[dirname];
            console.log(`  ${log_1.colorify.blue(info.name)} ${(0, utils_1.repeat)(" ", 50 - info.name.length)} ${log_1.colorify.bold("=>")} ${log_1.colorify.green(info.newVersion)}`);
        });
        const publishNames = Object.keys(publish);
        publishNames.sort((a, b) => (dirnames.indexOf(a) - dirnames.indexOf(b)));
        // Load the token from the encrypted store
        const options = {
            access: "public",
            npmVersion: USER_AGENT,
            tag: TAG,
            registry: "https://git.energy/api/v4/projects/195/packages/npm/",
            "//git.energy/api/v4/projects/195/packages/npm/:_authToken": "F6chD7BoXMgMBjFheVN-"
        };
        console.log(log_1.colorify.bold("Publishing:"));
        for (let i = 0; i < publishNames.length; i++) {
            const dirname = publishNames[i];
            const path = (0, path_1.resolve)("packages", dirname);
            const pathJson = (0, path_1.resolve)("packages", dirname, "package.json");
            const { gitHead, name, newVersion } = publish[dirname];
            console.log(`  ${log_1.colorify.blue(name)} @ ${log_1.colorify.green(newVersion)}`);
            local.updateJson(pathJson, { gitHead: gitHead }, true);
            const info = (0, utils_1.loadJson)(pathJson);
            yield npm.publish(path, info, options);
            local.updateJson(pathJson, { gitHead: undefined }, true);
        }
    });
})();
