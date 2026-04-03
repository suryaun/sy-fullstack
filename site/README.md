# Seere Yaana Static Landing Site

This folder is a no-build static site for GitHub Pages.

## Files
- `index.html` - Page markup
- `styles.css` - Styling and responsive design
- `script.js` - Contact links and reveal animations
- `CNAME` - Custom domain (`seereyaana.com`)

## Update Business Details
Edit `CONTACT` values in `script.js`:
- `instagramUrl`
- `whatsappDisplay`
- `whatsappNumber`
- `whatsappMessage`
- `email`
- `shopUrl`

## GitHub Pages Setup
1. Push this repo to GitHub.
2. In repository settings, open **Pages**.
3. Set source to **Deploy from branch**.
4. Choose branch `main` and folder `/site`.
5. Save and wait for deployment.

## GoDaddy DNS
In GoDaddy DNS for `seereyaana.com`:
- Add `A` records for GitHub Pages:
  - `185.199.108.153`
  - `185.199.109.153`
  - `185.199.110.153`
  - `185.199.111.153`
- Add `CNAME` for `www` pointing to `<your-github-username>.github.io`

After propagation, your static site will be live on `seereyaana.com`.
