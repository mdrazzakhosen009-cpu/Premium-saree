# SAREE — Premium Saree E-commerce

## Render
Build command: `npm install`
Start command: `npm start`

Set these Environment Variables in Render:
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `OPENAI_API_KEY` (optional; enables AI image matching/product generation)
- `OPENAI_MODEL` (optional)

## Important
Do NOT put Turso or OpenAI secrets in frontend code.
Rotate the Turso token that was previously exposed in chat and use the new token in Render.

## Admin
Open `/admin/`.
Initial password comes from Render `ADMIN_PASSWORD`.
After login, use **Change Password**. The changed password is hashed and stored in Turso.

## Image storage
The included admin uploader converts selected images to data URLs and stores them in Turso. Keep uploads reasonably sized (small optimized JPG/WebP is recommended). For a large catalog, use object storage later and save only URLs in Turso.

## Included
- Premium storefront
- Search/category filtering
- Featured/new products
- Cart and checkout
- bKash/Nagad/Rocket/COD
- Transaction ID
- SAR-000001 order IDs
- Order tracking
- Admin dashboard
- Product CRUD
- Image upload
- Agent system
- Store/payment/delivery settings
- Logo/branding setting
- Chatbot quick-button settings
- Chatbot order assistance
- AI catalog image matching
- AI product information generation
- Turso persistence
