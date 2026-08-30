const express=require("express");
const session=require("express-session");
const crypto=require("crypto");
const helmet=require("helmet");
const {createClient}=require("@libsql/client");

const app=express();
const PORT=process.env.PORT||3000;
const dbUrl=process.env.TURSO_DATABASE_URL;
const dbToken=process.env.TURSO_AUTH_TOKEN;

if(!dbUrl||!dbToken) console.warn("TURSO_DATABASE_URL/TURSO_AUTH_TOKEN are not set.");
const db=createClient({url:dbUrl||"file:local.db",authToken:dbToken});

app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:"10mb"}));
app.use(express.urlencoded({extended:true,limit:"10mb"}));
app.use(session({
  secret:process.env.SESSION_SECRET||"CHANGE_ME_IN_RENDER",
  resave:false,saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*24*60*60*1000}
}));
app.use(express.static(__dirname+"/public"));
app.use("/admin",express.static(__dirname+"/admin"));

const hash=v=>crypto.createHash("sha256").update(String(v)).digest("hex");
const oid=id=>"SAR-"+String(id).padStart(6,"0");
const bool=v=>v===true||v==="true"||v==="1"||v===1;

async function all(sql,args=[]){return (await db.execute({sql,args})).rows}
async function get(sql,args=[]){const r=await db.execute({sql,args});return r.rows[0]}
async function run(sql,args=[]){return db.execute({sql,args})}

async function init(){
 await run(`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)`);
 await run(`CREATE TABLE IF NOT EXISTS products(
   id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,price REAL NOT NULL,old_price REAL DEFAULT 0,
   category TEXT DEFAULT 'Saree',description TEXT DEFAULT '',tags TEXT DEFAULT '',image TEXT DEFAULT '',
   featured INTEGER DEFAULT 0,is_new INTEGER DEFAULT 0,stock INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`); 
 await run(`CREATE TABLE IF NOT EXISTS orders(
   id INTEGER PRIMARY KEY AUTOINCREMENT,customer_name TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,
   payment_method TEXT NOT NULL,payment_number TEXT DEFAULT '',transaction_id TEXT DEFAULT '',total REAL NOT NULL,
   status TEXT DEFAULT 'Pending',items_json TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
 await run(`CREATE TABLE IF NOT EXISTS agents(
   id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,whatsapp TEXT DEFAULT '',messenger_url TEXT DEFAULT '',active INTEGER DEFAULT 1)`);
 const defaults={
  store_name:"SAREE",logo:"/assets/saree-logo.svg",theme:"luxury",
  delivery_promise:"ঢাকার ভিতরে 1–2 দিন, ঢাকার বাইরে 2–4 দিন",
  opening_hours:"প্রতিদিন সকাল 10টা থেকে রাত 10টা",
  store_info:"SAREE-তে premium saree collection পাওয়া যায়—Katan, Jamdani, Organza, Cotton ও festive saree।",
  bkash_number:"",nagad_number:"",rocket_number:"",
  payment_note:"Send Money করে Transaction ID দিন।",bkash_enabled:"1",nagad_enabled:"1",rocket_enabled:"1",cod_enabled:"1",
  ai_q1_title:"Delivery Time",ai_q1_text:"ঢাকার ভিতরে 1–2 দিন, ঢাকার বাইরে 2–4 দিন।",
  ai_q2_title:"Store Info",ai_q2_text:"SAREE-তে premium saree collection পাওয়া যায়।",
  ai_q3_title:"Order Now",ai_q3_text:"আপনার পছন্দের saree-এর নাম বলুন, আমি order নিতে সাহায্য করব।",
  ai_q4_title:"Contact Agent",ai_q4_text:"সরাসরি WhatsApp/Messenger agent-এর সাথে কথা বলুন।",
  admin_password_hash:hash(process.env.ADMIN_PASSWORD||"")
 };
 for(const [k,v] of Object.entries(defaults))
   await run(`INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)`,[k,String(v)]);
 if(!process.env.ADMIN_PASSWORD){
   console.warn("ADMIN_PASSWORD is not set. Admin login is disabled until it is configured.");
 }
 const c=await get("SELECT COUNT(*) AS c FROM products");
 if(Number(c.c)===0){
  const seed=[
   ["Katan Silk Saree",2490,2990,"Katan","Elegant Katan silk saree with premium finish.","katan,silk,festive",1,1,10],
   ["Jamdani Saree",1890,2290,"Jamdani","Classic Jamdani-inspired weave for timeless occasions.","jamdani,classic",1,0,12],
   ["Organza Saree",2190,2590,"Organza","Lightweight organza saree with refined border.","organza,party",0,1,8],
   ["Cotton Saree",1490,1790,"Cotton","Comfortable breathable saree for everyday elegance.","cotton,tangail",0,0,20]
  ];
  for(const p of seed) await run(`INSERT INTO products(name,price,old_price,category,description,tags,featured,is_new,stock) VALUES(?,?,?,?,?,?,?,?,?)`,p);
 }
}
const settings=async()=>Object.fromEntries((await all("SELECT key,value FROM settings")).map(x=>[x.key,x.value]));
const auth=(req,res,next)=>req.session.admin?next():res.status(401).json({error:"Admin login required"});
const paymentMethods=s=>[
 ["Bkash","bkash"],["Nagad","nagad"],["Rocket","rocket"]
].filter(x=>s[x[1]+"_enabled"]==="1"&&s[x[1]+"_number"]).map(x=>({method:x[0],number:s[x[1]+"_number"]}));

app.get("/health",async(req,res)=>{try{await get("SELECT 1 AS ok");res.json({ok:true,service:"SAREE",database:"Turso"})}catch(e){res.status(503).json({ok:false,error:"Database unavailable"})}});
app.get("/api/settings",async(req,res)=>{const s=await settings();delete s.admin_password_hash;res.json(s)});
app.get("/api/products",async(req,res)=>{
 try{
  let sql="SELECT * FROM products WHERE 1=1",args=[];
  if(req.query.category&&req.query.category!=="all"){sql+=" AND category=?";args.push(req.query.category)}
  if(req.query.search){const q="%"+req.query.search+"%";sql+=" AND (name LIKE ? OR tags LIKE ? OR category LIKE ? OR description LIKE ?)";args.push(q,q,q,q)}
  sql+=" ORDER BY featured DESC,is_new DESC,id DESC";
  res.json(await all(sql,args));
 }catch(e){console.error(e);res.status(500).json({error:"Could not load products"})}
});
app.get("/api/products/:id",async(req,res)=>{const p=await get("SELECT * FROM products WHERE id=?",[Number(req.params.id)]);p?res.json(p):res.status(404).json({error:"Product not found"})});
app.get("/api/agents",async(req,res)=>res.json(await all("SELECT id,name,whatsapp,messenger_url,active FROM agents WHERE active=1 ORDER BY id DESC")));

app.post("/api/orders",async(req,res)=>{
 try{
  const b=req.body||{};
  if(!b.customer_name||!b.phone||!b.address||!b.payment_method||!Array.isArray(b.items)||!b.items.length)
   return res.status(400).json({error:"সব required তথ্য দিন।"});
  const s=await settings(),pm=String(b.payment_method);
  const allowed=["Cash on Delivery",...paymentMethods(s).map(x=>x.method)];
  if(!allowed.includes(pm))return res.status(400).json({error:"এই payment method এখন available নয়।"});
  let total=0,items=[];
  for(const item of b.items){
   const p=await get("SELECT * FROM products WHERE id=?",[Number(item.id)]);
   if(!p)return res.status(400).json({error:"একটি product পাওয়া যায়নি।"});
   const qty=Math.max(1,Math.min(99,Number(item.qty||1)));
   if(Number(p.stock)>0 && qty>Number(p.stock))return res.status(400).json({error:`${p.name} এর stock কম।`});
   total+=Number(p.price)*qty;items.push({id:p.id,name:p.name,price:Number(p.price),qty,image:p.image||""});
  }
  const payNum=pm==="Cash on Delivery"?"":s[pm.toLowerCase()+"_number"]||"";
  const r=await run(`INSERT INTO orders(customer_name,phone,address,payment_method,payment_number,transaction_id,total,status,items_json) VALUES(?,?,?,?,?,?,?,?,?)`,
   [String(b.customer_name).trim(),String(b.phone).trim(),String(b.address).trim(),pm,payNum,String(b.transaction_id||"").trim(),total,"Pending",JSON.stringify(items)]);
  res.json({success:true,order_id:oid(r.lastInsertRowid),total,status:"Pending"});
 }catch(e){console.error(e);res.status(500).json({error:"Order could not be created"})}
});

app.post("/api/admin/login",async(req,res)=>{
 const s=await settings(),p=String(req.body?.password||"");
 if(!process.env.ADMIN_PASSWORD && !s.admin_password_hash)return res.status(503).json({error:"ADMIN_PASSWORD is not configured on Render."});
 if(!p||hash(p)!==s.admin_password_hash)return res.status(401).json({error:"Invalid admin password"});
 req.session.admin=true;res.json({success:true});
});
app.get("/api/admin/me",auth,(req,res)=>res.json({authenticated:true}));
app.post("/api/admin/logout",auth,(req,res)=>req.session.destroy(()=>res.json({success:true})));

app.get("/api/admin/dashboard",auth,async(req,res)=>{
 const rev=await get("SELECT COALESCE(SUM(total),0) AS total FROM orders WHERE status!='Cancelled'");
 const orders=await get("SELECT COUNT(*) AS c FROM orders"),products=await get("SELECT COUNT(*) AS c FROM products"),agents=await get("SELECT COUNT(*) AS c FROM agents WHERE active=1");
 res.json({revenue:Number(rev.total||0),orders:Number(orders.c),products:Number(products.c),agents:Number(agents.c)});
});
app.get("/api/admin/products",auth,async(req,res)=>res.json(await all("SELECT * FROM products ORDER BY id DESC")));
app.post("/api/admin/products",auth,async(req,res)=>{
 const b=req.body||{};if(!b.name||b.price===undefined)return res.status(400).json({error:"Product name ও price required."});
 const r=await run(`INSERT INTO products(name,price,old_price,category,description,tags,image,featured,is_new,stock) VALUES(?,?,?,?,?,?,?,?,?,?)`,
 [String(b.name).trim(),Number(b.price),Number(b.old_price||0),b.category||"Saree",b.description||"",b.tags||"",b.image||"",bool(b.featured)?1:0,bool(b.is_new)?1:0,Number(b.stock||0)]);
 res.json({success:true,product:await get("SELECT * FROM products WHERE id=?",[r.lastInsertRowid])});
});
app.put("/api/admin/products/:id",auth,async(req,res)=>{
 const old=await get("SELECT * FROM products WHERE id=?",[Number(req.params.id)]);if(!old)return res.status(404).json({error:"Product not found"});
 const b=req.body||{};
 await run(`UPDATE products SET name=?,price=?,old_price=?,category=?,description=?,tags=?,image=?,featured=?,is_new=?,stock=? WHERE id=?`,
 [b.name??old.name,Number(b.price??old.price),Number(b.old_price??old.old_price),b.category??old.category,b.description??old.description,b.tags??old.tags,b.image??old.image,bool(b.featured)?1:0,bool(b.is_new)?1:0,Number(b.stock??old.stock),Number(req.params.id)]);
 res.json({success:true});
});
app.delete("/api/admin/products/:id",auth,async(req,res)=>{const r=await run("DELETE FROM products WHERE id=?",[Number(req.params.id)]);r.rowsAffected?res.json({success:true}):res.status(404).json({error:"Product not found"})});

app.get("/api/admin/orders",auth,async(req,res)=>res.json(await all("SELECT * FROM orders ORDER BY id DESC")));
app.patch("/api/admin/orders/:id",auth,async(req,res)=>{
 const ok=["Pending","Confirmed","Processing","Shipped","Delivered","Cancelled"],st=String(req.body?.status||"");
 if(!ok.includes(st))return res.status(400).json({error:"Invalid order status"});
 await run("UPDATE orders SET status=? WHERE id=?",[st,Number(req.params.id)]);res.json({success:true});
});
app.get("/api/admin/agents",auth,async(req,res)=>res.json(await all("SELECT * FROM agents ORDER BY id DESC")));
app.post("/api/admin/agents",auth,async(req,res)=>{
 const b=req.body||{};if(!b.name)return res.status(400).json({error:"Agent name required"});
 const r=await run("INSERT INTO agents(name,whatsapp,messenger_url,active) VALUES(?,?,?,?)",[b.name,b.whatsapp||"",b.messenger_url||"",bool(b.active)?1:0]);
 res.json({success:true,id:r.lastInsertRowid});
});
app.put("/api/admin/agents/:id",auth,async(req,res)=>{
 const o=await get("SELECT * FROM agents WHERE id=?",[Number(req.params.id)]);if(!o)return res.status(404).json({error:"Agent not found"});
 const b=req.body||{};await run("UPDATE agents SET name=?,whatsapp=?,messenger_url=?,active=? WHERE id=?",[b.name??o.name,b.whatsapp??o.whatsapp,b.messenger_url??o.messenger_url,b.active===undefined?o.active:(bool(b.active)?1:0),Number(req.params.id)]);res.json({success:true});
});
app.delete("/api/admin/agents/:id",auth,async(req,res)=>{await run("DELETE FROM agents WHERE id=?",[Number(req.params.id)]);res.json({success:true})});

app.get("/api/admin/settings",auth,async(req,res)=>{const s=await settings();delete s.admin_password_hash;res.json(s)});
app.put("/api/admin/settings",auth,async(req,res)=>{
 const allowed=["store_name","logo","theme","delivery_promise","opening_hours","store_info","bkash_number","nagad_number","rocket_number","payment_note","bkash_enabled","nagad_enabled","rocket_enabled","cod_enabled","ai_q1_title","ai_q1_text","ai_q2_title","ai_q2_text","ai_q3_title","ai_q3_text","ai_q4_title","ai_q4_text"];
 for(const k of allowed)if(req.body?.[k]!==undefined)await run(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,[k,String(req.body[k])]);
 const s=await settings();delete s.admin_password_hash;res.json({success:true,settings:s});
});
app.put("/api/admin/password",auth,async(req,res)=>{
 const s=await settings(),cur=String(req.body?.current_password||""),next=String(req.body?.new_password||"");
 if(next.length<8)return res.status(400).json({error:"New password must be at least 8 characters."});
 if(hash(cur)!==s.admin_password_hash)return res.status(401).json({error:"Current password is incorrect."});
 await run(`INSERT INTO settings(key,value) VALUES('admin_password_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,[hash(next)]);
 res.json({success:true});
});

async function aiCall(messages){
 const key=process.env.OPENAI_API_KEY;if(!key)throw new Error("OPENAI_API_KEY not configured");
 const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
 body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4o-mini",temperature:.2,messages})});
 if(!r.ok)throw new Error("AI request failed "+r.status);const d=await r.json();return d.choices?.[0]?.message?.content||"";
}
app.post("/api/ai/match",async(req,res)=>{
 try{
  const img=String(req.body?.image||"");if(!img)return res.status(400).json({error:"Image required"});
  const products=await all("SELECT id,name,price,category,description,tags,image FROM products ORDER BY featured DESC,is_new DESC,id DESC");
  const prompt=`You are SAREE catalog matcher. Compare the customer's image with this catalog and return ONLY JSON: {"product_id":number|null,"confidence":number,"reason":"short"}.
Catalog: ${JSON.stringify(products.map(p=>({id:p.id,name:p.name,category:p.category,tags:p.tags,description:p.description})))}`;
  const content=await aiCall([{role:"system",content:prompt},{role:"user",content:[{type:"text",text:"Match this saree image to the closest catalog product."},{type:"image_url",image_url:{url:img}}]}]);
  res.json(JSON.parse(content.replace(/```json|```/g,"").trim()));
 }catch(e){console.error("AI MATCH",e);res.status(503).json({error:"AI image matching is unavailable. Add OPENAI_API_KEY on Render."})}
});
app.post("/api/admin/ai-product",auth,async(req,res)=>{
 try{
  const b=req.body||{},img=b.image||"";
  if(!process.env.OPENAI_API_KEY)return res.json({preview:{name:b.name||"Premium Saree",price:Number(b.price||0),category:b.category||"Saree",description:b.description||"Premium saree with elegant finish.",tags:b.tags||"saree,premium,fashion",image:img}});
  const content=await aiCall([{role:"system",content:"You are an expert saree e-commerce copywriter. Return ONLY JSON with name,category,description,tags. Never invent technical facts."},
   {role:"user",content:[{type:"text",text:"Create product information for this saree image."},{type:"image_url",image_url:{url:img}}]}]);
  res.json({preview:{...JSON.parse(content.replace(/```json|```/g,"").trim()),price:Number(b.price||0),image:img}});
 }catch(e){res.status(503).json({error:"AI product generation unavailable."})}
});

app.post("/api/chat",async(req,res)=>{
 const msg=String(req.body?.message||"").trim();if(!msg)return res.status(400).json({error:"Message required"});
 const s=await settings(),products=await all("SELECT id,name,price,category,description,tags,image FROM products ORDER BY featured DESC,is_new DESC,id DESC");
 const quick=[
  {title:s.ai_q1_title,text:s.ai_q1_text||s.delivery_promise},
  {title:s.ai_q2_title,text:s.ai_q2_text||s.store_info},
  {title:s.ai_q3_title,text:s.ai_q3_text||"Order Now"},
  {title:s.ai_q4_title,text:s.ai_q4_text||""}
 ];
 if([s.ai_q1_title,s.ai_q2_title,s.ai_q3_title,s.ai_q4_title].some(x=>x&&x.toLowerCase()===msg.toLowerCase())){
  const map={};quick.forEach(x=>map[x.title]=x.text);return res.json({reply:map[msg]||"Admin এখনো তথ্য সেট করেননি।",quick});
 }
 try{
  const pay=paymentMethods(s).map(x=>x.method+" "+x.number).join(", ");
  const system=`You are the official SAREE shopping assistant. Answer in Bangla when appropriate. Never invent products, prices, payment numbers or delivery promises.
Store: ${s.store_info}; Hours: ${s.opening_hours}; Delivery: ${s.delivery_promise}; Payments: ${pay}${s.cod_enabled==="1"?", Cash on Delivery":""}.
Catalog: ${JSON.stringify(products.map(p=>({id:p.id,name:p.name,price:p.price,category:p.category,description:p.description,tags:p.tags})))}
If the user wants to order, collect name, phone, address, payment method and transaction id (unless COD), then tell them to confirm. Return concise JSON: {"reply":"...","product_id":number|null,"quantity":number|null,"order":false,"name":"","phone":"","address":"","payment_method":"","transaction_id":"","confirm":false}`;
  const content=await aiCall([{role:"system",content:system},{role:"user",content:msg}]);
  const data=JSON.parse(content.replace(/```json|```/g,"").trim());
  res.json({...data,quick});
 }catch(e){
  const q=msg.toLowerCase();const p=products.find(x=>q.includes(String(x.name).toLowerCase())||q.includes(String(x.category||"").toLowerCase()));
  res.json({reply:p?`${p.name} — ৳${Number(p.price).toLocaleString("en-BD")}। ${p.description||""}`:`অবশ্যই ❤️ আমি SAREE-এর product, price, delivery ও order সম্পর্কে সাহায্য করতে পারি।`,quick});
 }
});
app.get("/api/orders/:id",async(req,res)=>{
 const raw=String(req.params.id).replace(/^SAR-/i,""),id=Number(raw);if(!Number.isInteger(id))return res.status(400).json({error:"Invalid Order ID"});
 const o=await get("SELECT id,status,total,created_at,items_json FROM orders WHERE id=?",[id]);if(!o)return res.status(404).json({error:"Order not found"});
 res.json({order_id:oid(o.id),status:o.status,total:o.total,created_at:o.created_at,items:JSON.parse(o.items_json||"[]")});
});
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"Internal server error"})});
init().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log("SAREE running on "+PORT))).catch(e=>{console.error("Startup failed",e);process.exit(1)});
