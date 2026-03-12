# 🚀 Quick Start Guide

## Get Started in 2 Minutes

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### Installation

```bash
# Navigate to the project
cd editorial-app

# Install dependencies
npm install

# Start development server
npm run dev
```

### Open in Browser

```
http://localhost:5174
```

You're automatically logged in as:
- **Email:** `admin@editorial.local`
- **Plan:** Premium (all features unlocked)
- **Admin:** Yes (can access admin panel)

---

## 🎯 What You Can Do

### 1. Explore the Editor
- Navigate to **Editor** to create and edit books
- Add chapters and content
- See real-time pagination with page preview

### 2. Browse Dashboard
- View your books collection
- Create new books
- Delete books
- See subscription status

### 3. Check Pricing
- View available plans and pricing
- See credit packages
- Learn about features

### 4. Admin Panel
- Manage users and subscriptions
- View system configuration
- Monitor export statistics
- Adjust payment settings

### 5. Try Different User Types

Edit `src/services/firebase.mock.js` line 248 to change mock user plan:

```javascript
// Change 'premium' to 'free' or 'pro'
subscription: {
  plan: 'premium',  // ← Change this
  status: 'active',
  credits: 100,
}
```

---

## 📚 Available Routes

| Route | Purpose | Access |
|-------|---------|--------|
| `/` | Redirects to books | Everyone |
| `/login` | Login page | Everyone |
| `/register` | Sign up page | Everyone |
| `/books` | Books dashboard | Authenticated users |
| `/app` | Editor | Authenticated users |
| `/pricing` | Pricing page | Everyone |
| `/admin` | Admin panel | Admin users only |

---

## 🔧 Environment

No configuration needed! The app detects that Firebase credentials are missing and automatically uses **mock mode**.

To use real Firebase later:
1. Get Firebase credentials
2. Add to `.env.local`
3. Restart dev server
4. App automatically switches (no code changes needed!)

---

## 📖 Documentation

- **[MOCK_FIREBASE_MODE.md](./MOCK_FIREBASE_MODE.md)** — Understand how mock mode works
- **[DEVELOPMENT_STATUS.md](./DEVELOPMENT_STATUS.md)** — Full project status
- **[FASE3_COMPLETE.md](./FASE3_COMPLETE.md)** — Stripe integration details
- **[functions/README.md](./functions/README.md)** — Cloud Functions guide

---

## 🐛 Troubleshooting

### App shows blank page
```bash
# Clear npm cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Port 5174 is already in use
The app will automatically try port 5175, 5176, etc. Check the terminal for the actual URL.

### Want to see console logs
Open DevTools: Press `F12` or `Ctrl+Shift+I`
Look for messages like:
```
🎭 Mock Firebase initialized (development mode)
✅ Mock Firebase initialized for development mode
```

### Mock data disappeared after reload
That's normal! Mock data is in-memory (lost on page reload). Just reload and you're logged back in with fresh data.

---

## 💡 Tips

1. **Test Different Plans** → Change mock user plan in `src/services/firebase.mock.js`
2. **Add More Sample Data** → Edit `initializeMockDevelopmentMode()` in `firebase.mock.js`
3. **Check Network Tab** → DevTools → Network tab to see API calls
4. **Inspect Mock DB** → DevTools → Console and type what you see in logs
5. **Test Responsiveness** → DevTools → Toggle device toolbar

---

## 🎓 Learning Resources

The codebase is organized by feature:

```
src/
├── components/     # UI components
├── pages/          # Page-level components
├── services/       # Business logic & integrations
├── hooks/          # Custom React hooks
├── store/          # Zustand state management
├── contexts/       # React context (Auth)
└── types/          # TypeScript type definitions
```

Start by exploring:
1. `/books` → `src/pages/BooksPage.jsx` — Dashboard component
2. `/app` → `src/components/Layout/Layout.jsx` — Editor layout
3. `useAuth()` → `src/contexts/AuthContext.jsx` — Auth logic

---

## 🚀 Next Steps

Once you're familiar with the UI:

1. **Understand the Pagination Engine**
   - Open `src/hooks/usePagination.js`
   - This creates the page layout algorithm

2. **Explore State Management**
   - Open `src/store/useEditorStore.ts`
   - This manages book/chapter data

3. **Check Stripe Integration**
   - Open `src/services/stripe.js`
   - See how payments would work with real Firebase

4. **Review Cloud Functions**
   - Open `functions/src/createCheckoutSession.ts`
   - These need Firebase credentials to deploy

---

## 📝 Questions?

- Check the documentation files in the project root
- Look at code comments for implementation details
- Open DevTools console (F12) to see debug logs

---

**Happy coding! 🎉**

The app is fully functional and ready for testing. All you need is this dev server running!
