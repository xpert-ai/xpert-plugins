"""Real Chromium interaction tests. No npm packages are needed.

Uses the self-contained distribution as an offline document so the suite also runs
in browser installations whose navigation is restricted by enterprise policy.
Set CHROMIUM_EXECUTABLE to select a Chromium executable. Native persistence across
origins and physical hardware inputs require an unrestricted target-browser run.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, time, traceback, re, base64

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'standalone.html').read_text()
CASES = []
def case(name):
    def register(fn): CASES.append((name, fn)); return fn
    return register

def settle(page): page.wait_for_timeout(70)
def ev(page, text): return page.evaluate(text)
def tab(page, id): return page.locator(f'.ad-tab[data-tab-id="{id}"]:visible')
def pane(page, id): return page.locator(f'.ad-pane[data-pane-id="{id}"]:visible')
def center(locator):
    rect = locator.bounding_box(); assert rect, 'Element must have a layout box'
    return rect['x']+rect['width']/2, rect['y']+rect['height']/2

def drag(page, locator, x, y, cancel=False, ctrl=False):
    sx, sy = center(locator)
    page.mouse.move(sx, sy); page.mouse.down()
    if ctrl: page.keyboard.down('Control')
    page.mouse.move(sx+8, sy+8); settle(page)
    page.mouse.move(x, y, steps=12); settle(page)
    if cancel: page.keyboard.press('Escape')
    page.mouse.up()
    if ctrl: page.keyboard.up('Control')
    settle(page)

@case('Standalone runtime: 14 content models, four panes, retained DOM, no dependencies')
def initial(page):
    assert ev(page, 'demo.AD.validateLayout(demo.manager.Layout).contents') == 14
    assert page.locator('.ad-pane:visible').count() == 4
    assert page.get_by_text('Everything in its place.', exact=True).is_visible()
    assert ev(page, 'AvalonDock.DockingManager === Xceed.Wpf.AvalonDock.DockingManager')

@case('Editable buffers survive tab switching and model deserialization with node identity')
def editor(page):
    tab(page,'workspace.js').click(); settle(page)
    field = page.get_by_role('textbox',name='Editor workspace.js',exact=True)
    field.fill('// retained buffer\nconst answer = 42;'); ev(page, 'window.originalEditor=document.querySelector("[data-editor]")')
    tab(page,'welcome').click();tab(page,'workspace.js').click();settle(page)
    assert field.input_value() == '// retained buffer\nconst answer = 42;'
    ev(page,'demo.manager.LoadLayout(demo.manager.SaveLayout())');settle(page)
    assert ev(page,'window.originalEditor === document.querySelector("[data-editor]")')
    assert field.input_value().endswith('42;')

@case('Live counter, input and canvas survive floating and redocking')
def retained(page):
    tab(page,'preview').click();settle(page)
    page.get_by_role('textbox',name='State retention input').fill('Stay with me')
    page.locator('.preview-counter').click();page.locator('.preview-counter').click()
    ev(page,'window.previewInput=document.querySelector(".preview-input");window.canvas=document.querySelector("canvas");window.canvasPixels=canvas.toDataURL();demo.manager.Float(demo.manager.Find("preview"))');settle(page)
    assert page.locator('.ad-floating').count() == 1
    assert page.locator('.preview-input').input_value() == 'Stay with me'
    assert ev(page,'document.querySelector("canvas")===canvas && canvas.toDataURL()===canvasPixels')
    page.get_by_role('button',name='Dock window',exact=True).click();settle(page)
    assert ev(page,'document.querySelector(".preview-input")===previewInput')
    assert page.locator('.preview-counter').get_attribute('data-count') == '2'
    assert not ev(page,'demo.manager.Find("preview").IsFloating')

@case('Tab drag: same-pane reordering and insertion marker')
def reorder(page):
    end = tab(page,'preview').bounding_box()
    drag(page, tab(page,'welcome'), end['x']+end['width']-4,end['y']+end['height']/2)
    assert ev(page,'demo.manager.FindById("documents-main").Children.map(x=>x.ContentId)') == ['workspace.js','preview','welcome']

@case('Tab drag: four-way docking preview and split operation')
def split_drag(page):
    r=pane(page,'documents-main').bounding_box()
    sx,sy=center(tab(page,'workspace.js'));page.mouse.move(sx,sy);page.mouse.down();page.mouse.move(sx+15,sy+12);settle(page)
    page.mouse.move(r['x']+r['width']/2+40,r['y']+r['height']/2,steps=12);settle(page)
    assert page.locator('.ad-drop-guide').count() == 5
    assert page.locator('.ad-drop-preview').count() == 1
    page.mouse.up();settle(page)
    assert ev(page,'demo.manager.Find("workspace.js").Parent !== demo.manager.Find("welcome").Parent')
    assert page.locator('.ad-document-pane:visible').count() == 2

@case('Pointer Escape cancellation leaves layout unchanged')
def cancel_drag(page):
    before=ev(page,'demo.manager.SaveLayout()')
    r=pane(page,'documents-main').bounding_box();drag(page,tab(page,'welcome'),r['x']+80,r['y']+160,cancel=True)
    assert not ev(page,'demo.manager.Find("welcome").IsFloating')
    assert ev(page,'demo.manager.FindById("documents-main").Children.Count')==3
    assert page.locator('.ad-drop-guide').count()==0

@case('Ctrl-drag creates in-page floating window and physical resize works')
def float_drag(page):
    r=pane(page,'documents-main').bounding_box();drag(page,tab(page,'workspace.js'),r['x']+100,r['y']+190,ctrl=True)
    assert ev(page,'demo.manager.Find("workspace.js").IsFloating')
    f=page.locator('.ad-floating');before=f.bounding_box();grip=f.locator('.ad-resize-se');x,y=center(grip);drag(page,grip,x+80,y+45)
    after=f.bounding_box();assert after['width']>before['width']+50 and after['height']>before['height']+25
    assert ev(page,'demo.manager.Layout.FloatingWindows[0].FloatingWidth')>before['width']

@case('Floating title movement, maximize/restore and docking')
def floating_controls(page):
    ev(page,'demo.manager.Float(demo.manager.Find("preview"), {FloatingLeft:300,FloatingTop:180,FloatingWidth:440,FloatingHeight:340})');settle(page)
    title=page.locator('.ad-float-caption');x,y=center(title);drag(page,title,x+105,y+70,ctrl=True)
    assert ev(page,'demo.manager.Layout.FloatingWindows[0].FloatingLeft')>390
    page.get_by_role('button',name='Maximize window',exact=True).click();settle(page)
    assert ev(page,'demo.manager.Layout.FloatingWindows[0].IsMaximized')
    page.get_by_role('button',name='Restore window',exact=True).click();settle(page)
    assert not ev(page,'demo.manager.Layout.FloatingWindows[0].IsMaximized')
    page.get_by_role('button',name='Dock window',exact=True).click();settle(page)
    assert page.locator('.ad-floating').count()==0

@case('Tool title drag moves its entire group to a root edge')
def tool_group(page):
    rect=page.locator('#dock').bounding_box()
    drag(page,pane(page,'tools-left').locator('.ad-pane-caption'),rect['x']+rect['width']/2,rect['y']+9)
    assert ev(page,'demo.manager.Find("explorer").Parent === demo.manager.Find("search").Parent')
    assert ev(page,'demo.manager._sideFor(demo.manager.Find("explorer").Parent)')=='Top'

@case('Auto-hide pin, rail peek and re-pin preserve grouped tools')
def autohide(page):
    pane(page,'tools-left').get_by_role('button',name='Auto-hide group',exact=True).click();settle(page)
    assert ev(page,'demo.manager.Find("explorer").IsAutoHidden && demo.manager.Find("search").IsAutoHidden')
    page.locator('.ad-anchor-tab[data-content-id="explorer"]').click();settle(page)
    assert page.locator('.ad-peek').is_visible()
    page.locator('.ad-peek').get_by_role('button',name='Pin tool window',exact=True).click();settle(page)
    assert not ev(page,'demo.manager.Find("explorer").IsAutoHidden')
    assert pane(page,'tools-left').is_visible()

@case('Auto-hide opens by mouse hover and dismisses by Escape')
def hover(page):
    page.locator('.ad-anchor-tab[data-content-id="history"]').hover();page.wait_for_timeout(420)
    assert page.locator('.ad-peek').is_visible()
    page.locator('#dock').focus();page.keyboard.press('Escape');settle(page)
    assert page.locator('.ad-peek').count()==0

@case('Splitter physical drag respects minimums and commits undo history')
def splitter(page):
    before=pane(page,'tools-left').bounding_box()['width'];split=page.locator('.ad-splitter').first;x,y=center(split);drag(page,split,x+72,y)
    after=pane(page,'tools-left').bounding_box()['width'];assert after>before+50
    assert ev(page,'demo.manager.CanUndo');page.locator('#undo-layout').click();settle(page)
    assert abs(pane(page,'tools-left').bounding_box()['width']-before)<2

@case('Focused splitter supports keyboard resizing')
def splitter_keyboard(page):
    split=page.locator('.ad-splitter').first;before=pane(page,'tools-left').bounding_box()['width'];split.focus();page.keyboard.press('Shift+ArrowRight');settle(page)
    assert pane(page,'tools-left').bounding_box()['width']>before+35

@case('Context commands, disabled capabilities and canceled close')
def context(page):
    tab(page,'workspace.js').click(button='right');settle(page)
    assert page.get_by_role('menu').is_visible()
    page.get_by_role('menuitem',name='Float',exact=True).click();settle(page)
    assert ev(page,'demo.manager.Find("workspace.js").IsFloating')
    ev(page,'demo.manager.Dock(demo.manager.Find("workspace.js"));demo.manager.Find("workspace.js").CanFloat=false');settle(page)
    tab(page,'workspace.js').click(button='right');settle(page)
    assert page.get_by_role('menuitem',name='Float',exact=True).is_disabled()
    page.keyboard.press('Escape');ev(page,'demo.protectModified(true);demo.manager.Find("workspace.js").IsModified=true');settle(page)
    tab(page,'workspace.js').get_by_role('button',name='Close tab',exact=True).click();settle(page)
    assert ev(page,'!!demo.manager.Find("workspace.js")')
    assert page.locator('#toast').inner_text().startswith('Close canceled')

@case('Property inspector updates the live title and capability flags')
def inspector(page):
    title=page.locator('#inspect-title');title.fill('Custom overview');title.press('Tab');settle(page)
    assert ev(page,'demo.manager.Find("welcome").Title')=='Custom overview'
    page.locator('#inspect-CanFloat').uncheck();settle(page)
    assert not ev(page,'demo.manager.Find("welcome").CanFloat')

@case('Keyboard tab selection, reorder, F6 and MRU navigator')
def keyboard(page):
    tab(page,'welcome').focus();page.keyboard.press('ArrowRight');settle(page)
    assert ev(page,'demo.manager.ActiveModel.ContentId')=='workspace.js'
    page.keyboard.press('Alt+Shift+ArrowRight');settle(page)
    assert ev(page,'demo.manager.FindById("documents-main").Children[2].ContentId')=='workspace.js'
    page.keyboard.press('F6');settle(page)
    assert ev(page,'demo.manager.ActiveModel.ContentId')!='workspace.js'
    page.keyboard.down('Control');page.keyboard.press('Tab');settle(page)
    assert page.get_by_role('dialog',name='Switch active window').is_visible()
    page.keyboard.up('Control');settle(page)
    assert page.locator('.ad-navigator').count()==0

@case('Observable source demo creates/removes real documents')
def sources(page):
    page.locator('[data-tool="sources"]').click();settle(page)
    page.get_by_role('button',name='＋ Add source item',exact=True).click();settle(page)
    assert ev(page,'demo.sourceDocuments.Count')==1
    assert ev(page,'demo.manager.Find("source-1").Content===demo.sourceDocuments[0]')
    ev(page,'demo.showTool("sources")');settle(page)
    page.locator('.source-row button').last.click();settle(page)
    assert ev(page,'demo.manager.Find("source-1")===null')

@case('All six themes and four workspace presets render without errors')
def presets(page):
    for theme in ['light','dark','aero','vs2010','metro','contrast']:
        page.locator('#theme-select').select_option(theme);settle(page);assert page.locator('#dock').get_attribute('data-theme')==theme
    for preset in ['focus','design','debug','development']:
        page.locator('#preset-select').select_option(preset);settle(page);assert ev(page,'demo.AD.validateLayout(demo.manager.Layout).contents')==14

@case('Sample app menu and command palette invoke actual commands')
def commands(page):
    page.locator('[data-menu="File"]').click();settle(page);page.get_by_role('menuitem',name='New document',exact=True).click();settle(page)
    assert ev(page,'demo.manager.ActiveModel.Title').startswith('untitled-')
    page.keyboard.press('Control+k');settle(page);page.locator('#command-input').fill('Show Search');page.keyboard.press('Enter');settle(page)
    assert ev(page,'demo.manager.ActiveModel.ContentId')=='search'

@case('XML file import roundtrips using real file-input change event')
def import_file(page):
    xml=ev(page,'demo.manager.SaveLayout("xml")');ev(page,'demo.manager.Float(demo.manager.Find("preview"))');settle(page)
    page.locator('#layout-file').set_input_files({'name':'workspace.xml','mimeType':'application/xml','buffer':xml.encode()});settle(page)
    assert not ev(page,'demo.manager.Find("preview").IsFloating')
    assert 'Layout imported' in page.locator('#toast').inner_text()

@case('Declarative custom element creates an isolated docking manager')
def declarative(page):
    ev(page,'''() => {const el=document.createElement('avalon-dock');el.id='declarative';el.style.cssText='position:fixed;inset:120px 200px 160px;z-index:300';el.innerHTML='<layout-root><layout-panel><layout-document-pane><layout-document title="Declarative editor" content-id="decl"><textarea aria-label="Declarative editor">Hello web component</textarea></layout-document></layout-document-pane></layout-panel></layout-root>';document.body.append(el);}''');settle(page)
    assert page.get_by_role('textbox',name='Declarative editor',exact=True).input_value()=='Hello web component'
    assert ev(page,'document.querySelector("#declarative").manager.Find("decl").Title')=='Declarative editor'
    page.get_by_role('textbox',name='Declarative editor',exact=True).focus();page.keyboard.press('Control+F4');settle(page)
    assert ev(page,'document.querySelector("#declarative").manager.Find("decl")===null')
    assert ev(page,'demo.AD.contents(demo.manager.Layout).length')==14
    ev(page,'window.extra=document.querySelector("#declarative");window.extraManager=extra.manager;extra.remove()');settle(page)
    assert ev(page,'extraManager._disposed')

@case('Factory cleanup runs on replacement/release/disposal, not on docking')
def cleanup(page):
    ev(page,'''() => {window.disposals=0;const host=document.createElement('div');host.style.cssText='position:fixed;width:600px;height:400px;left:400px;top:180px;z-index:300';document.body.append(host);window.cleanupManager=new AvalonDock.DockingManager(host);const node=document.createElement('textarea');node.value='lifecycle';window.cleanDoc=cleanupManager.AddDocument({ContentId:'clean',Title:'Lifecycle',Content:()=>({element:node,dispose(){window.disposals++;}})});}''');settle(page)
    ev(page,'cleanDoc.Float();cleanDoc.Dock()');settle(page);assert ev(page,'disposals')==0
    ev(page,'cleanDoc.Close()');settle(page);assert ev(page,'disposals')==0
    ev(page,'cleanupManager.ReleaseContent("clean")');assert ev(page,'disposals')==1
    ev(page,'cleanupManager.Dispose()');assert ev(page,'disposals')==1

@case('DOM event cancellation is honored for document closing')
def dom_cancel(page):
    ev(page,'''() => {document.querySelector('#dock').addEventListener('avalondock:DocumentClosing', e => e.preventDefault(), {once:true});demo.manager.Find('welcome').Close();}''');settle(page)
    assert ev(page,'!!demo.manager.Find("welcome")')

@case('Touch pointer path docks content using PointerEvents')
def touch_pointer(page):
    source=tab(page,'workspace.js');sx,sy=center(source);r=pane(page,'documents-main').bounding_box();tx=r['x']+r['width']/2+40;ty=r['y']+r['height']/2
    source.dispatch_event('pointerdown',{'pointerId':41,'pointerType':'touch','isPrimary':True,'button':0,'buttons':1,'clientX':sx,'clientY':sy,'bubbles':True})
    page.locator('body').dispatch_event('pointermove',{'pointerId':41,'pointerType':'touch','isPrimary':True,'button':0,'buttons':1,'clientX':tx,'clientY':ty,'bubbles':True});settle(page)
    page.locator('body').dispatch_event('pointerup',{'pointerId':41,'pointerType':'touch','isPrimary':True,'button':0,'buttons':0,'clientX':tx,'clientY':ty,'bubbles':True});settle(page)
    assert ev(page,'demo.manager.Find("workspace.js").Parent !== demo.manager.Find("welcome").Parent')

@case('Browser popup denial is reported without corrupting the layout')
def blocked_popup(page):
    ev(page,'window.originalOpen=window.open;window.open=()=>null;demo.manager.PopOut(demo.manager.Find("preview"));window.open=originalOpen');settle(page)
    assert not ev(page,'demo.manager.Find("preview").IsFloating')
    assert 'blocked this popup' in page.locator('#toast').inner_text()

@case('Native browser pop-out preserves content and docks back')
def popup(page):
    tab(page,'preview').click();settle(page);page.locator('.preview-input').fill('Across windows')
    with page.expect_popup(timeout=5000) as event:
        ev(page,'demo.manager.PopOut(demo.manager.Find("preview"))')
    popup=event.value;settle(page);popup.wait_for_timeout(150)
    assert popup.locator('.preview-input').input_value()=='Across windows'
    popup.get_by_role('button',name='Dock back into workspace',exact=True).click();settle(page)
    assert page.locator('.preview-input').input_value()=='Across windows'
    assert not ev(page,'demo.manager.Find("preview").IsFloating')

@case('500-tab workload mounts one body and keeps frame work coalesced')
def workload(page):
    start=time.perf_counter()
    ev(page,'''() => {const host=document.createElement('div');host.style.cssText='position:fixed;inset:150px;z-index:300';document.body.append(host);window.mass=new AvalonDock.DockingManager(host,{EnableHistory:false});mass.Transaction('Load 500',()=>{for(let i=0;i<500;i++)mass.AddDocument({ContentId:'mass-'+i,Title:'Document '+i,Content:'Content '+i});});}''');settle(page)
    assert ev(page,'AvalonDock.contents(mass.Layout).length')==500
    assert ev(page,'mass._view.contentRecords.size')==1
    assert ev(page,'Number.isFinite(mass._view.lastRenderTime)')
    assert time.perf_counter()-start<15
    ev(page,'mass.Dispose()')

@case('Mobile-size focus workspace remains editable without application overflow')
def mobile(page):
    page.set_viewport_size({'width':760,'height':800});ev(page,'demo.applyPreset("focus")');settle(page)
    tab(page,'workspace.js').click();settle(page)
    field=page.get_by_role('textbox',name='Editor workspace.js',exact=True);field.fill('const mobile = true;')
    assert field.input_value()=='const mobile = true;'
    assert ev(page,'document.documentElement.scrollWidth<=innerWidth')


@case('State-preserving DOM moves retain a live iframe context')
def iframe_retention(page):
    ev(page,'''() => {const frame=document.createElement('iframe');frame.srcdoc='<input value="initial">';frame.title='Hosted iframe';window.hostedFrame=frame;demo.manager.AddDocument({ContentId:'iframe',Title:'Iframe',Content:frame});}''');page.wait_for_timeout(150)
    ev(page,'''() => {window.frameWindow=hostedFrame.contentWindow;frameWindow.marker=79;frameWindow.document.querySelector('input').value='iframe state';demo.manager.Float(demo.manager.Find('iframe'));}''');settle(page)
    assert ev(page,'hostedFrame.contentWindow===frameWindow && frameWindow.marker===79')
    assert ev(page,"frameWindow.document.querySelector('input').value")=='iframe state'
    ev(page,'demo.manager.Dock(demo.manager.Find("iframe"))');settle(page)
    assert ev(page,'hostedFrame.contentWindow===frameWindow && frameWindow.marker===79')

@case('Open browser popup can dock back after a layout reload')
def popup_reload(page):
    with page.expect_popup(timeout=5000) as event:ev(page,'demo.manager.PopOut(demo.manager.Find("preview"))')
    popup=event.value;settle(page);ev(page,'demo.manager.LoadLayout(demo.manager.SaveLayout())');settle(page)
    popup.get_by_role('button',name='Dock back into workspace',exact=True).click();settle(page)
    assert not ev(page,'demo.manager.Find("preview").IsFloating')

@case('Content factory failures are isolated to their own panel')
def error_boundary(page):
    ev(page,"demo.manager.AddDocument({ContentId:'faulty',Title:'Faulty',Content:()=>{throw new Error('Expected factory failure');}})");settle(page)
    assert page.get_by_role('alert').get_by_text('Content could not be rendered').is_visible()
    tab(page,'welcome').click();settle(page);assert page.get_by_text('Everything in its place.',exact=True).is_visible()

@case('Measured dimensions and absolute-size splitter lock are honored')
def measured_locked(page):
    width=ev(page,'demo.manager.FindById("tools-left").ActualWidth');assert width>150
    ev(page,'demo.manager.FindById("tools-left").ResizableAbsoluteDockWidth=false');settle(page)
    split=page.locator('.ad-splitter').first;assert split.get_attribute('aria-disabled')=='true'
    x,y=center(split);drag(page,split,x+80,y)
    assert abs(pane(page,'tools-left').bounding_box()['width']-width)<2



@case('Native ES module entry and sample execute under browser module semantics')
def native_modules(page):
    # Import maps supply the unchanged module graph offline; no classic packer is used.
    imports={}
    for module in (ROOT/'src').glob('*.js'):
        source=module.read_text()
        source=re.sub(r"(['\"])\./([a-z-]+\.js)\1",lambda m: "'ad:"+m.group(2)+"'",source)
        imports['ad:'+module.name]='data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
    markup=(ROOT/'index.html').read_text()
    markup=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>','',markup)
    styles=(ROOT/'src'/'avalondock.css').read_text()+(ROOT/'sample'/'sample.css').read_text()
    source=(ROOT/'sample'/'sample.js').read_text().replace("'../src/index.js'","'ad:index.js'")
    markup=markup.replace('</head>','<style>'+styles+'</style><script type="importmap">'+json.dumps({'imports':imports})+'</script></head>')
    markup=markup.replace('<script type="module" src="sample/sample.js"></script>','<script type="module">'+source.replace('</script','<\\/script')+'</script>')
    # A fresh document is required: custom-element registries belong to their window.
    context=page.context.browser.new_context(viewport={'width':1600,'height':1040});native=context.new_page();errs=[];native.on('pageerror',lambda error:errs.append(str(error)))
    try:
        native.set_content(markup,wait_until='load');native.wait_for_function('!!window.demo');settle(native)
        assert ev(native,'demo.AD.validateLayout(demo.manager.Layout).contents')==14
        ev(native,'demo.applyPreset("design")');settle(native)
        ev(native,'demo.applyPreset("debug")');settle(native)
        doc=ev(native,'demo.manager.AddDocument({Title:"ESM",ContentId:"esm-test",Content:"Native module"}).ContentId')
        assert doc=='esm-test'
        assert native.get_by_text('Native module',exact=True).is_visible()
        assert not errs,errs
    finally:
        context.close()



@case('Minimal declarative integration retains editor state through float and restore')
def minimal_integration(page):
    markup=(ROOT/'sample'/'minimal.html').read_text()
    markup=markup.replace('<link rel="stylesheet" href="../dist/avalondock.css">','<style>'+(ROOT/'dist'/'avalondock.css').read_text()+'</style>')
    markup=markup.replace('<script src="../dist/avalondock.js"></script>','<script>'+(ROOT/'dist'/'avalondock.js').read_text().replace('</script','<\\/script')+'</script>')
    context=page.context.browser.new_context(viewport={'width':1200,'height':800});native=context.new_page();errs=[]
    native.on('pageerror',lambda error:errs.append(str(error)))
    try:
        native.set_content(markup,wait_until='load');native.wait_for_function('!!document.querySelector("avalon-dock").manager');settle(native)
        field=native.get_by_role('textbox',name='Minimal editor');field.fill('Standalone component integration')
        native.get_by_role('button',name='Save snapshot',exact=True).click()
        native.get_by_role('button',name='Float editor',exact=True).click();settle(native)
        assert native.locator('.ad-floating').count()==1
        native.get_by_role('button',name='Restore',exact=True).click();settle(native)
        assert native.locator('.ad-floating').count()==0
        assert field.input_value()=='Standalone component integration'
        native.get_by_role('button',name='Toggle auto-hide',exact=True).click();settle(native)
        assert ev(native,'document.querySelector("avalon-dock").manager.Find("tools").IsAutoHidden')
        assert not errs,errs
    finally:context.close()


def main():
    result=[]; screenshot_dir=ROOT/'test-results';screenshot_dir.mkdir(exist_ok=True)
    for old in screenshot_dir.glob('failure-*.png'):old.unlink()
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
        version=browser.version
        for name,fn in CASES:
            page=browser.new_page(viewport={'width':1600,'height':1040},device_scale_factor=1)
            page.set_default_timeout(4500)
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            start=time.perf_counter();entry={'name':name,'passed':False}
            try:
                page.set_content(HTML,wait_until='load');settle(page);assert ev(page,'!!window.demo')
                fn(page);settle(page)
                assert not errors, f'Uncaught browser errors: {errors}'
                entry['passed']=True
            except Exception as error:
                entry['error']=str(error);entry['traceback']=traceback.format_exc();entry['pageErrors']=errors
                page.screenshot(path=str(screenshot_dir/f'failure-{len(result)+1}.png'))
            finally:
                entry['seconds']=round(time.perf_counter()-start,3);result.append(entry);print(('PASS' if entry['passed'] else 'FAIL')+' '+name,flush=True)
                if not entry['passed']:print('  '+entry['error'][:900],flush=True)
                page.close()
        browser.close()
    report={'browser':version,'mode':'Chromium offline standalone document; real DOM and PointerEvents','passed':sum(x['passed'] for x in result),'failed':sum(not x['passed'] for x in result),'tests':result}
    (screenshot_dir/'browser-results.json').write_text(json.dumps(report,indent=2))
    print(f"{report['passed']}/{len(result)} browser groups passed in Chromium {version}")
    raise SystemExit(1 if report['failed'] else 0)
if __name__=='__main__':main()
