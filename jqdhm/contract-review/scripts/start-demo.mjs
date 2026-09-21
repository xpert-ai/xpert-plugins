import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startPreview } from './preview.mjs';

const serviceDir=fileURLToPath(new URL('../java-service/',import.meta.url));
let jars=[];
try{jars=(await readdir(new URL('../java-service/target/',import.meta.url))).filter(name=>name.endsWith('.jar')&&!name.endsWith('-sources.jar'));}catch{}
if(jars.length!==1)throw new Error('Build the Java service first: mvn -f java-service/pom.xml package');
const token=process.env.CONTRACT_SERVICE_TOKEN||randomBytes(32).toString('hex');
const servicePort=Number(process.env.CONTRACT_SERVICE_PORT||8097),previewPort=Number(process.env.PREVIEW_PORT||4397);
const serviceUrl=`http://127.0.0.1:${servicePort}`;
try{await fetch(`${serviceUrl}/health`,{signal:AbortSignal.timeout(500)});throw new Error(`Port ${servicePort} already serves HTTP; stop it or choose CONTRACT_SERVICE_PORT.`);}catch(error){if(error.message.startsWith('Port '))throw error;}
const java=spawn(process.env.JAVA_CMD||'java',['-jar',`target/${jars[0]}`],{cwd:serviceDir,windowsHide:true,env:{...process.env,CONTRACT_SERVICE_TOKEN:token,SERVER_ADDRESS:'127.0.0.1',SERVER_PORT:String(servicePort)},stdio:['ignore','pipe','pipe']});
java.stdout.on('data',chunk=>{if(chunk.toString().includes('Started ContractReviewApplication'))console.log('Java contract service started.');});
java.stderr.on('data',chunk=>process.stderr.write(chunk));
let preview,stopping=false,earlyExit;
java.on('error',error=>{earlyExit=error;});
java.on('exit',code=>{if(!stopping){earlyExit=new Error(`Java service exited (${code}). Check JDK 21+ and service configuration.`);console.error(earlyExit.message);preview?.server.close();process.exitCode=1;}});
function stop(){stopping=true;preview?.server.close();java.kill();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('exit',()=>java.kill());
try{
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
    if(earlyExit)throw earlyExit;
    try{const response=await fetch(`${serviceUrl}/health`,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready)throw new Error('Java service did not become ready within 30 seconds.');
  preview=await startPreview({serviceUrl,serviceToken:token,port:previewPort});
  console.log(`Open ${preview.url}`);
  console.log('Local bridge + Java demo. Fixture extraction is labeled; no LLM or Xpert installation is claimed. Ctrl+C stops both services.');
}catch(error){stop();throw error;}
