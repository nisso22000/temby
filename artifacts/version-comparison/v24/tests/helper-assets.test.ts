import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {helperAsset} from '../src/helper-assets.js';

test('helper packaging reuses identical bytes and invalidates edits without changing script order',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'temby-helpers-'));const first=join(directory,'first.js'),second=join(directory,'second.js');
  try{
    await writeFile(first,'first();');await writeFile(second,'second();');
    const files=[pathToFileURL(first),pathToFileURL(second)];const initial=await helperAsset(files);
    assert.equal(initial.data.toString(),'first();\nsecond();');assert.equal((await helperAsset(files)).data,initial.data);
    await writeFile(second,'changedSecond();');const updated=await helperAsset(files);assert.notEqual(updated.etag,initial.etag);assert.equal(updated.data.toString(),'first();\nchangedSecond();');
  }finally{await unlink(first);await unlink(second);await rmdir(directory);}
});
