import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';

export interface SessionStore {load():unknown;save(value:unknown):void;}
// The Windows user's DPAPI protects the encryption key. Neither cookies nor
// mailbox names are written in plaintext. Tests supply an isolated random key.
export class LocalSessionStore implements SessionStore {
  private file:string;private key:Buffer;
  constructor(directory:string,testKey?:Buffer){
    mkdirSync(directory,{recursive:true});this.file=join(directory,'sessions.enc');
    if(testKey){this.key=testKey;}else{
      if(process.platform!=='win32')throw Error('Local session persistence requires Windows DPAPI');
      const keyFile=join(directory,'session-key.dpapi');
      const protect=!existsSync(keyFile),input=protect?randomBytes(32):readFileSync(keyFile);
      const operation=protect?'Protect':'Unprotect';
      const script=`Add-Type -AssemblyName System.Security; $inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::${operation}($inputBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
      const output=Buffer.from(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',script],{input:input.toString('base64'),encoding:'utf8',windowsHide:true,timeout:15000}).trim(),'base64');
      if(protect){writeFileSync(keyFile,output,{flag:'wx',mode:0o600});this.key=input;}else this.key=output;
    }
    if(this.key.length!==32)throw Error('Invalid local session encryption key');
  }
  load():unknown{
    if(!existsSync(this.file))return [];
    const bytes=readFileSync(this.file);if(bytes.length<32||bytes.length>32*1024*1024)throw Error('Invalid local session file');
    const cipher=createDecipheriv('aes-256-gcm',this.key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));
    return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8'));
  }
  save(value:unknown){
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,nonce);
    const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
    const temp=this.file+'.tmp';writeFileSync(temp,Buffer.concat([nonce,cipher.getAuthTag(),body]),{mode:0o600});renameSync(temp,this.file);
  }
}
