import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]||path.join(root,'build','saitodel'));
if(out===root || !out.startsWith(path.join(root,'build')+path.sep))throw Error('Output must be a child of build');
if(fs.existsSync(out))throw Error('Output already exists; use a fresh version directory');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'plugin.json'),'utf8'));
const inputs=['SKILL.md','agents','assets','references','vendor','sources.lock.json','scripts/source-manager.mjs'];
for(const name of inputs) if(!fs.existsSync(path.join(root,name)))throw Error('Missing package input: '+name);
fs.mkdirSync(path.dirname(out),{recursive:true});
const stage=fs.mkdtempSync(path.join(path.dirname(out),'.saitodel-package-'));
try {
  const payload=path.join(stage,'skills','saitodel');
  fs.mkdirSync(payload,{recursive:true});
  for(const name of inputs){
    const dest=path.join(payload,name);fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.cpSync(path.join(root,name),dest,{recursive:true});
  }
  fs.copyFileSync(path.join(root,'plugin.json'),path.join(stage,'plugin.json'));
  if(fs.existsSync(out))throw Error('Output appeared during packaging; refusing overwrite');
  fs.renameSync(stage,out);
} catch(error) {
  // Only this invocation's unpublished staging directory is removed.
  fs.rmSync(stage,{recursive:true,force:true});
  throw error;
}
console.log(JSON.stringify({status:'PACKAGED',directory:out,version:manifest.version}));
