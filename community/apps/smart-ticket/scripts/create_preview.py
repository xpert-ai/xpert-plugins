import os

preview_dir = 'xpert-plugins/community/apps/smart-ticket/preview'
os.makedirs(preview_dir, exist_ok=True)

crm_modules = 'xpert-plugins/community/apps/crm/node_modules'
with open(f'{crm_modules}/react/umd/react.production.min.js', encoding='utf-8') as f:
    react_js = f.read()
with open(f'{crm_modules}/react-dom/umd/react-dom.production.min.js', encoding='utf-8') as f:
    react_dom_js = f.read()
with open('xpert-plugins/community/apps/smart-ticket/src/lib/remote-components/smart_ticket__remote/app.js', encoding='utf-8') as f:
    app_js = f.read()

component_html = """<!DOCTYPE html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8" />
  <title>智能客诉工单工作台</title>
</head>
<body>
  <div id="root"></div>
  <script>""" + react_js + """</script>
  <script>""" + react_dom_js + """</script>
  <script>""" + app_js + """</script>
</body>
</html>"""

with open(f'{preview_dir}/component.html', 'w', encoding='utf-8') as f:
    f.write(component_html)

print('component.html created successfully')
