export class CapacityError extends Error {constructor(){super('Local upstream capacity exceeded');this.name='CapacityError';}}
// Bounded global + per-origin concurrency, held until body completion/cancel.
// Queue work is cancelable and never retried automatically.
export class ConcurrencyGate {
  private active=0;
  private origins=new Map<string,number>();
  private queue:Array<{origin:string;signal:AbortSignal;resolve:(release:()=>void)=>void;reject:(error:unknown)=>void;abort:()=>void}>=[];
  constructor(private total=32,private perOrigin=8,private maxQueue=128){}
  acquire(origin:string,signal:AbortSignal):Promise<()=>void>{
    signal.throwIfAborted();
    if(this.active<this.total&&(this.origins.get(origin)||0)<this.perOrigin)return Promise.resolve(this.take(origin));
    if(this.queue.length>=this.maxQueue)return Promise.reject(new CapacityError());
    return new Promise((resolve,reject)=>{
      const entry={origin,signal,resolve,reject,abort:()=>{const at=this.queue.indexOf(entry);if(at>=0)this.queue.splice(at,1);reject(signal.reason);}};
      signal.addEventListener('abort',entry.abort,{once:true});this.queue.push(entry);
    });
  }
  private take(origin:string){
    this.active++;this.origins.set(origin,(this.origins.get(origin)||0)+1);let released=false;
    return ()=>{if(released)return;released=true;this.active--;const count=(this.origins.get(origin)||1)-1;if(count)this.origins.set(origin,count);else this.origins.delete(origin);this.drain();};
  }
  private drain(){
    for(let i=0;i<this.queue.length&&this.active<this.total;){
      const entry=this.queue[i];
      if((this.origins.get(entry.origin)||0)>=this.perOrigin){i++;continue;}
      this.queue.splice(i,1);entry.signal.removeEventListener('abort',entry.abort);
      if(entry.signal.aborted)entry.reject(entry.signal.reason);else entry.resolve(this.take(entry.origin));
    }
  }
  stats(){return {active:this.active,queued:this.queue.length};}
}
