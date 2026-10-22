import {spawnCommand} from './runner.mjs';
import {resolveCommand} from './config.mjs';
const child=spawnCommand(resolveCommand('lark-cli'),process.argv.slice(2),{stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
