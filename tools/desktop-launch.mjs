import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);const electron=require('electron');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(electron,[join(dirname(dirname(fileURLToPath(import.meta.url))),'desktop')],{env,stdio:'inherit',windowsHide:false});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code||0;});
