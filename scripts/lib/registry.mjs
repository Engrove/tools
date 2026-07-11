/**
 * AI-CODING NOTE:
 * Responsibility: Load and validate canonical site and per-tool metadata into one immutable registry.
 * Inputs: config/site.json and tools/<slug>/tool.json.
 * Outputs: Frozen normalized registry.
 * Safe edits: Strict schema-aligned validation and normalization.
 * Do not: Infer required metadata, use mtime, or accept unknown fields.
 * Verification: npm run check:schema && npm run check:registry.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SITE_KEYS=['$schema','schemaVersion','siteId','name','canonicalOrigin','language','organization','contentPolicy'];
const REQUIRED=['$schema','schemaVersion','slug','name','shortName','summary','description','category','tags','keywords','entry','public','hidden','language','version','updated','canonicalPath','icon','ogImage','robots','capabilities','inputs','outputs','whenToUse','whenNotToUse','limitations','privacy','access','claims','faq','evidence','relatedTools'];
const OPTIONAL=['buildOutputDir'];
export const exists=async(file)=>fs.access(file).then(()=>true,()=>false);
const assert=(value,message)=>{if(!value)throw new Error(message)};
const exact=(value,keys,label)=>{assert(value&&typeof value==='object'&&!Array.isArray(value),`${label}: object required`);const unknown=Object.keys(value).filter((key)=>!keys.includes(key));const missing=keys.filter((key)=>!(key in value));assert(!unknown.length&&!missing.length,`${label}: unknown=[${unknown}] missing=[${missing}]`)};
const array=(value,label)=>assert(Array.isArray(value)&&value.length,`${label}: non-empty array required`);
const relative=(value,label)=>assert(typeof value==='string'&&value&&!path.isAbsolute(value)&&!value.split(/[\\/]/).includes('..'),`${label}: safe relative path required`);
const https=(value,label)=>assert(new URL(value).protocol==='https:',`${label}: HTTPS required`);
const freeze=(value)=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child)}return value};

function validate(tool,slug){
  exact(tool,[...REQUIRED,...OPTIONAL],`tool:${slug}`);
  assert(tool.$schema==='../../schema/tool.schema.json'&&tool.schemaVersion==='1.0.0',`schema mismatch: ${slug}`);
  assert(tool.slug===slug&&tool.canonicalPath===`/tools/${slug}/`,`route mismatch: ${slug}`);
  assert(tool.public===true&&tool.hidden===false&&tool.language==='en',`visibility mismatch: ${slug}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(tool.updated),`updated invalid: ${slug}`);
  assert(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tool.version),`version invalid: ${slug}`);
  assert(tool.robots==='index,follow',`robots invalid: ${slug}`);
  relative(tool.entry,`${slug}.entry`);if(tool.buildOutputDir)relative(tool.buildOutputDir,`${slug}.buildOutputDir`);
  for(const key of ['tags','keywords','capabilities','inputs','outputs','whenToUse','whenNotToUse','limitations'])array(tool[key],`${slug}.${key}`);
  for(const item of tool.inputs){exact(item,['name','type','required','description'],`${slug}.input`);assert(typeof item.required==='boolean',`${slug}.input.required invalid`)}
  for(const item of tool.outputs)exact(item,['name','type','description'],`${slug}.output`);
  exact(tool.privacy,['processing','storesApplicationUserDataOnServer','requiresAccount','requiresOAuth'],`${slug}.privacy`);
  exact(tool.access,['cost','registrationRequired'],`${slug}.access`);
  exact(tool.claims,['mayClaim','negativeClaimBoundaries','mustNotClaim'],`${slug}.claims`);
  for(const key of ['mayClaim','negativeClaimBoundaries','mustNotClaim'])array(tool.claims[key],`${slug}.claims.${key}`);
  for(const item of tool.faq)exact(item,['question','answer'],`${slug}.faq`);
  for(const item of tool.evidence){exact(item,['type','label','url'],`${slug}.evidence`);https(item.url,`${slug}.evidence.url`)}
  const positive=new Set(tool.claims.mayClaim.map((item)=>item.toLowerCase()));
  assert(!tool.claims.mustNotClaim.some((item)=>positive.has(item.toLowerCase())),`claim polarity collision: ${slug}`);
}

export async function loadRegistry(root,sourceRevision=null){
  const site=JSON.parse(await fs.readFile(path.join(root,'config','site.json'),'utf8'));
  exact(site,SITE_KEYS,'site');
  assert(site.$schema==='../schema/site.schema.json'&&site.schemaVersion==='1.0.0','site schema mismatch');
  assert(site.canonicalOrigin==='https://tools.engroveaudio.com'&&site.language==='en','site identity mismatch');
  exact(site.organization,['id','name','url'],'site.organization');https(site.organization.id,'site.organization.id');https(site.organization.url,'site.organization.url');
  exact(site.contentPolicy,['searchIndexing','aiRetrievalInputContext','aiModelTraining'],'site.contentPolicy');exact(site.contentPolicy.aiModelTraining,['policy','enforcement'],'site.contentPolicy.aiModelTraining');
  const entries=(await fs.readdir(path.join(root,'tools'),{withFileTypes:true})).filter((entry)=>entry.isDirectory()&&!entry.name.startsWith('_')&&!entry.name.startsWith('.')).sort((a,b)=>a.name.localeCompare(b.name));
  const tools=[];
  for(const entry of entries){const sourceDir=path.join(root,'tools',entry.name),manifestPath=path.join(sourceDir,'tool.json');assert(await exists(manifestPath),`MISSING_TOOL_MANIFEST: ${entry.name}`);const tool=JSON.parse(await fs.readFile(manifestPath,'utf8'));validate(tool,entry.name);tools.push({...tool,sourceDir,canonicalUrl:`${site.canonicalOrigin}${tool.canonicalPath}`,appPath:`${tool.canonicalPath}app/`})}
  const slugs=new Set(tools.map((tool)=>tool.slug));assert(slugs.size===tools.length,'duplicate slugs');for(const tool of tools)for(const related of tool.relatedTools)assert(slugs.has(related),`unknown related tool: ${tool.slug}->${related}`);
  return freeze({site:{...site},tools,publicTools:tools,generatedAt:null,sourceRevision});
}
