import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localSkillCatalog,skillPrompt} from './skills.mjs';
test('newly saved workflow skills are discovered on the very next task',()=>{
  const root=mkdtempSync(join(tmpdir(),'lark-skills-'));
  assert.equal(localSkillCatalog(root).length,0);
  const directory=join(root,'lark-workflow-customer-listing');mkdirSync(directory);
  const path=join(directory,'SKILL.md');
  writeFileSync(path,'---\nname: lark-workflow-customer-listing\ndescription: When the user says check the customer listing, open the confirmed customer file.\n---\nResource: https://example.com/customers');
  assert.equal(localSkillCatalog(root)[0].path,path);
  assert.ok(skillPrompt(root).includes('check the customer listing'));
  writeFileSync(path,'\uFEFF---\nname: lark-workflow-customer-listing\ndescription: Updated customer listing mapping.\n---\nResource: https://example.com/new-customers');
  assert.ok(skillPrompt(root).includes('Updated customer listing'));
  assert.ok(!skillPrompt(root).includes('check the customer listing'));
});
test('unrelated directories and incomplete skill files are omitted',()=>{
  const root=mkdtempSync(join(tmpdir(),'lark-skills-'));
  mkdirSync(join(root,'unrelated'));writeFileSync(join(root,'unrelated','SKILL.md'),'---\nname: other\ndescription: other\n---');
  mkdirSync(join(root,'lark-workflow-incomplete'));writeFileSync(join(root,'lark-workflow-incomplete','SKILL.md'),'unfinished');
  assert.equal(localSkillCatalog(root).length,0);
});
