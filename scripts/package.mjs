import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]||path.join(root,'build','saitodel'));
if(out===root || !out.startsWith(path.join(root,'build')+path.sep))throw Error('Output must be a child of build');
if(fs.existsSync(out))throw Error('Output already exists; use a fresh version directory');
fs.mkdirSync(path.join(out,'skills','saitodel'),{recursive:true});
fs.copyFileSync(path.join(root,'plugin.json'),path.join(out,'plugin.json'));
for(const name of ['SKILL.md','agents','assets','references','vendor','sources.lock.json','scripts/source-manager.mjs']){
 const src=path.join(root,name),dest=path.join(out,'skills','saitodel',name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.cpSync(src,dest,{recursive:true});
}
console.log(JSON.stringify({status:'PACKAGED',directory:out,version:JSON.parse(fs.readFileSync(path.join(root,'plugin.json'))).version}));

