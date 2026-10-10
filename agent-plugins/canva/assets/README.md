# Plugin icon

`icon.png` is Canva's public apple-touch icon, saved on 2026-10-10 from
`https://static.canva.com/static/images/apple-touch-icon.png`.

That response was HTTP 200, `image/png`, 60×60, with no redirect.

- SHA-256: `9194b64af53a201e357f10d52838202915b21660410843b13b4910c59d3fc01d`

`https://www.canva.com/favicon.ico` answers with a redirect. On the network
where the plugin list was checked, that redirect returned the Canva China
homepage HTML, so the host could not decode an image and showed the placeholder.

`plugin.json` embeds these same bytes in `extensions.xpertai.interface.icon`
as a `data:image/png;base64` URL. The installed package does not request an
external image. Preserve the asset bytes and update the data URL together
when replacing the icon.

The Codex Canva manifest at commit `1dc195897af4161d039b80d8471ec0a10c9bbc89`
does not declare a license, so its brand files are not copied.
