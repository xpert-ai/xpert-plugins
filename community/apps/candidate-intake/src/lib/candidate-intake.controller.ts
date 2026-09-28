import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  SetMetadata,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { memoryStorage } from 'multer'
import { MAX_PHOTO_BYTES, MAX_RESUME_BYTES, CANDIDATE_INTAKE_ROUTE } from './constants.js'
import { CandidateIntakeService } from './candidate-intake.service.js'
import type { CandidateProfile } from './types.js'

const Public = () => SetMetadata('isPublic', true)

@Controller(CANDIDATE_INTAKE_ROUTE)
export class CandidateIntakeController {
  constructor(private readonly service: CandidateIntakeService) {}

  @Get('apply/:token')
  @Public()
  renderApplication(@Param('token') token: string, @Res() response: Response) {
    response.type('html').send(renderCandidatePage(token))
  }

  @Get('public/:token')
  @Public()
  getApplication(@Param('token') token: string) {
    return this.service.getPublicApplication(token)
  }

  @Post('public/:token/draft')
  @Public()
  saveDraft(@Param('token') token: string, @Body() body: Partial<CandidateProfile>) {
    return this.service.saveDraft(token, body)
  }

  @Post('public/:token/resume')
  @Public()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_RESUME_BYTES, files: 1 }
    })
  )
  uploadResume(@Param('token') token: string, @UploadedFile() file: Express.Multer.File) {
    return this.service.uploadResume(token, file)
  }

  @Post('public/:token/photo')
  @Public()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1 }
    })
  )
  uploadPhoto(@Param('token') token: string, @UploadedFile() file: Express.Multer.File) {
    return this.service.uploadPhoto(token, file)
  }

  @Post('public/:token/submit')
  @Public()
  submit(
    @Param('token') token: string,
    @Body() body: { informationConsent?: boolean; accuracyConfirmed?: boolean }
  ) {
    return this.service.submit(token, body)
  }

  @Get('public/:token/resume')
  @Public()
  async getResume(@Param('token') token: string, @Res() response: Response) {
    const resume = await this.service.getResumeByToken(token)
    response
      .type(resume.mimeType)
      .setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(resume.fileName)}"`)
      .send(resume.data)
  }
}

export function renderCandidatePage(token: string) {
  // The token is serialized rather than interpolated into executable markup.
  const serializedToken = JSON.stringify(token).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>候选人信息登记</title>
  <style>
    :root{font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;color:#172033;background:#f5f7fb}
    *{box-sizing:border-box}body{margin:0}.shell{max-width:1040px;margin:0 auto;padding:36px 20px 80px}
    .hero{padding:28px;border-radius:20px;background:linear-gradient(135deg,#173b6c,#2563a5);color:white;box-shadow:0 18px 50px #173b6c25}
    .hero h1{margin:0 0 8px;font-size:30px}.hero p{margin:0;color:#dbeafe;line-height:1.7}
    .card{margin-top:18px;padding:24px;background:white;border:1px solid #e6eaf0;border-radius:16px;box-shadow:0 8px 24px #1720330d}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.full{grid-column:1/-1}
    label{display:grid;gap:7px;font-size:14px;font-weight:650;color:#354052}input,select,textarea{width:100%;border:1px solid #cfd6e2;border-radius:10px;padding:11px 12px;font:inherit;background:white;color:#172033}textarea{min-height:110px;resize:vertical}
    input:focus,select:focus,textarea:focus{outline:3px solid #bfdbfe;border-color:#2563eb}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
    button{border:0;border-radius:10px;padding:11px 18px;font-weight:700;cursor:pointer}.primary{background:#1d4ed8;color:white}.secondary{background:#e8eef8;color:#173b6c}.danger{background:#b42318;color:white}
    .hint{font-size:13px;color:#667085;line-height:1.6}.notice{margin-top:14px;padding:11px 13px;border-radius:10px;background:#eff6ff;color:#1e40af;display:none}.notice.error{background:#fef3f2;color:#b42318}.consent{display:flex;align-items:flex-start;gap:9px;margin-top:12px;font-size:14px;color:#475467}.consent input{width:auto;margin-top:3px}
    .loading{padding:80px 20px;text-align:center;color:#667085}.hidden{display:none!important}.subsection{margin-top:24px;padding-top:20px;border-top:1px solid #edf0f4}.subsection h3{margin:0 0 12px}.entry{position:relative;margin:10px 0;padding:16px;border:1px solid #e3e8ef;border-radius:12px;background:#fafbfc}.entry-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.remove{position:absolute;right:12px;top:10px;padding:6px 9px;background:#fef3f2;color:#b42318}.add{margin-top:8px;background:#eef4ff;color:#1849a9}.questions{display:grid;gap:14px}.question-required{color:#b42318}@media(max-width:720px){.grid,.entry-grid{grid-template-columns:1fr}.shell{padding:18px 12px 50px}.card,.hero{padding:18px}.hero h1{font-size:24px}}
  </style>
</head>
<body><main id="app" class="shell"><div class="loading">正在加载候选人登记表…</div></main>
<script>
(() => {
  const token=${serializedToken}; const base='/api/candidate-intake/public/'+encodeURIComponent(token); let state=null; let saveTimer=null;
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const request=async(url,options={})=>{const r=await fetch(url,options);const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.message||'请求失败，请稍后重试。');return data};
  const field=(label,name,value='',type='text',required=false)=>'<label>'+label+(required?' *':'')+'<input '+(required?'required ':'')+'type="'+type+'" name="'+name+'" value="'+esc(value)+'"></label>';
  const entryFields={education:[['school','学校','text'],['major','专业','text'],['degree','学历','text'],['startDate','开始时间','month'],['endDate','结束时间','month']],experiences:[['company','公司','text'],['title','职位','text'],['startDate','开始时间','month'],['endDate','结束时间','month'],['description','工作内容','textarea']],projects:[['name','项目名称','text'],['role','担任角色','text'],['description','项目说明','textarea']]};
  function entryRow(kind,item={}){return '<div class="entry" data-kind="'+kind+'" data-id="'+esc(item.id||newId())+'"><button class="remove" type="button">删除</button><div class="entry-grid">'+entryFields[kind].map(([key,label,type])=>'<label class="'+(type==='textarea'?'full':'')+'">'+label+(type==='textarea'?'<textarea data-field="'+key+'">'+esc(item[key]||'')+'</textarea>':'<input data-field="'+key+'" type="'+type+'" value="'+esc(item[key]||'')+'">')+'</label>').join('')+'</div></div>'}
  function entrySection(title,kind,items){return '<section class="subsection"><h3>'+title+'</h3><div id="'+kind+'Entries">'+(items||[]).map(item=>entryRow(kind,item)).join('')+'</div><button class="add" type="button" data-add="'+kind+'">添加'+title+'</button></section>'}
  function newId(){return 'entry_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)}
  function render(data){state=data;const p=data.profile||{};const locked=['submitted','screening','pending_review','confirmed'].includes(data.status);const expired=data.status==='expired';
    document.getElementById('app').innerHTML='<section class="hero"><h1>'+esc(data.job.companyName)+' · '+esc(data.job.roleName)+'</h1><p>'+esc(data.job.roleDescription)+'</p></section>'+
    '<form id="form" class="card"><section><h2>第一步：上传 PDF 简历</h2><p class="hint">请先上传文字型 PDF 简历。系统解析完成后会自动预填下方信息，请逐项核对并修改。</p><div class="grid"><label class="full">简历 PDF *<input id="resume" type="file" accept="application/pdf,.pdf"><span class="hint">仅 PDF，最大 10MB。'+(data.resume?'已上传：'+esc(data.resume.fileName):'尚未上传')+'</span></label></div></section><section class="subsection"><h2>候选人基本信息</h2><div class="grid">'+
    field('候选人姓名','name',p.name,'text',true)+field('当前所在城市','currentCity',p.currentCity)+field('手机号','phone',p.phone,'tel')+field('邮箱','email',p.email,'email')+
    '<label>候选人身份 *<select name="identity" required><option value="">请选择</option>'+options([['intern_student','在校生/实习生'],['fresh_graduate','应届毕业生'],['experienced','社会招聘']],p.identity)+'</select></label>'+
    '<label>工作年限 *<select name="workYears" required><option value="">请选择</option>'+options([['none','无工作经验'],['lt_1','0–1 年'],['1_3','1–3 年'],['3_5','3–5 年'],['5_10','5–10 年'],['10_plus','10 年以上']],p.workYears)+'</select></label>'+
    field('最高学历','highestDegree',p.highestDegree)+field('最早到岗时间','earliestAvailability',p.earliestAvailability,'date')+
    '<label class="full">技能（使用逗号分隔）<input name="skills" value="'+esc((p.skills||[]).join('，'))+'"></label><input type="hidden" name="abilitySummary" value="'+esc(p.abilitySummary||'')+'"></div></section>'+
    entrySection('教育经历','education',p.education)+entrySection('工作经历','experiences',p.experiences)+entrySection('项目经历','projects',p.projects)+
    '<section class="subsection"><h3>证书与作品</h3><div class="grid"><label class="full">证书（使用逗号分隔）<input name="certificates" value="'+esc((p.certificates||[]).join('，'))+'"></label>'+field('作品集或个人主页','portfolioUrl',p.portfolioUrl,'url')+'</div></section>'+
    ((data.job.questions||[]).length?'<section class="subsection"><h3>岗位补充问题</h3><div class="questions">'+data.job.questions.map(q=>'<label>'+esc(q.label)+(q.required?'<span class="question-required"> *</span>':'')+'<textarea data-question="'+esc(q.id)+'" '+(q.required?'required':'')+'>'+esc((p.answers||{})[q.id]||'')+'</textarea></label>').join('')+'</div></section>':'')+
    '<section class="subsection"><h2>附加材料</h2><div class="grid"><label class="full">个人照片（可选）<input id="photo" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png"><span class="hint">JPG/PNG，最大 5MB；照片不参与 Agent 初筛。</span></label></div></section>'+
    '<label class="consent"><input name="informationConsent" type="checkbox" '+(data.informationConsent?'checked':'')+'>我同意公司为本次招聘处理上述个人信息和简历。</label><label class="consent"><input name="accuracyConfirmed" type="checkbox" '+(data.accuracyConfirmed?'checked':'')+'>我已核对信息，并确认内容准确。</label>'+
    '<div class="actions"><button type="button" id="save" class="secondary">保存草稿</button><button type="submit" class="primary">确认并提交</button>'+(data.resume?'<button type="button" id="preview" class="secondary">预览简历</button>':'')+'</div><div id="notice" class="notice"></div></form>';
    const form=document.getElementById('form'); if(locked||expired){form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);show(expired?'链接已过期。':'信息已提交，感谢配合。',expired);return}
    form.addEventListener('input',()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>save(true),900)});form.addEventListener('click',e=>{const add=e.target.closest('[data-add]');if(add){document.getElementById(add.dataset.add+'Entries').insertAdjacentHTML('beforeend',entryRow(add.dataset.add));return}const remove=e.target.closest('.remove');if(remove)remove.closest('.entry').remove()});document.getElementById('save').onclick=()=>save(false);form.onsubmit=submit;
    document.getElementById('resume').onchange=e=>upload(e.target.files[0],'resume');document.getElementById('photo').onchange=e=>upload(e.target.files[0],'photo');if(data.resume)document.getElementById('preview').onclick=()=>window.open(base+'/resume','_blank','noopener');
  }
  function options(items,current){return items.map(([v,l])=>'<option value="'+v+'" '+(current===v?'selected':'')+'>'+l+'</option>').join('')}
  function collect(kind){return [...document.querySelectorAll('.entry[data-kind="'+kind+'"]')].map(row=>{const item={id:row.dataset.id};row.querySelectorAll('[data-field]').forEach(input=>item[input.dataset.field]=input.value.trim());return item}).filter(item=>Object.entries(item).some(([key,value])=>key!=='id'&&value))}
  function profile(){const form=document.getElementById('form');const f=new FormData(form);const answers={};form.querySelectorAll('[data-question]').forEach(input=>answers[input.dataset.question]=input.value.trim());return{name:f.get('name'),currentCity:f.get('currentCity'),phone:f.get('phone'),email:f.get('email'),identity:f.get('identity')||undefined,workYears:f.get('workYears')||undefined,highestDegree:f.get('highestDegree'),earliestAvailability:f.get('earliestAvailability'),skills:String(f.get('skills')||'').split(/[，,]/).map(v=>v.trim()).filter(Boolean),abilitySummary:f.get('abilitySummary'),education:collect('education'),experiences:collect('experiences'),projects:collect('projects'),certificates:String(f.get('certificates')||'').split(/[，,]/).map(v=>v.trim()).filter(Boolean),portfolioUrl:f.get('portfolioUrl'),answers}}
  async function save(silent){try{const data=await request(base+'/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(profile())});state=data;if(!silent)show('草稿已保存。')}catch(e){show(e.message,true)}}
  async function upload(file,kind){if(!file)return;const body=new FormData();body.append('file',file);show(kind==='resume'?'正在解析 PDF 简历…':'正在上传照片…');try{const data=await request(base+'/'+kind,{method:'POST',body});if(kind==='resume'&&data.parseError)show('PDF 已保存，但自动解析失败：'+data.parseError,true);else{show(kind==='resume'?'简历解析完成，请核对预填信息。':'照片已上传。');const fresh=await request(base);render(fresh)}}catch(e){show(e.message,true)}}
  async function submit(e){e.preventDefault();const f=e.currentTarget;try{await save(true);await request(base+'/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({informationConsent:f.informationConsent.checked,accuracyConfirmed:f.accuracyConfirmed.checked})});render(await request(base))}catch(err){show(err.message,true)}}
  function show(message,error=false){const el=document.getElementById('notice');if(!el)return;el.textContent=message;el.className='notice'+(error?' error':'');el.style.display='block'}
  request(base).then(render).catch(e=>{document.getElementById('app').innerHTML='<div class="card"><h2>无法打开登记表</h2><p>'+esc(e.message)+'</p></div>'});
})();
</script></body></html>`
}
