# Design Document: Secondary Sticky Header

## Overview

The Secondary Sticky Header is a floating navigation component that provides quick access to key sections of the RE-CAPS application. It sits below the main header and remains visible during scrolling, enhancing user navigation efficiency while maintaining a modern, aesthetically pleasing design.

### Goals

- Provide persistent, accessible navigation to primary application sections
- Maintain visual consistency with the existing sky-inspired gradient design
- Support both light and dark themes seamlessly
- Ensure responsive behavior across all device sizes
- Create a reusable, modular component

### Non-Goals

- Replace or modify the existing main header
- Implement complex routing logic beyond basic navigation
- Support more than the three defined navigation items (Home, Project Detail, AI Chatbot)
- Implement the AI Chatbot functionality itself

## Architecture

### Component Structure

The Secondary Sticky Header follows a three-tier architecture:

```
┌─────────────────────────────────────┐
│         Main Header                  │
│  (Existing - No Modifications)      │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│     Secondary Sticky Header          │
│  ┌─────┐  ┌──────────┐  ┌────────┐ │
│  │Home │  │ Project  │  │  AI    │ │
│  │     │  │ Detail   │  │Chatbot │ │
│  └─────┘  └──────────┘  └────────┘ │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│         Page Content                 │
└─────────────────────────────────────┘
```

### Positioning Strategy

The component uses CSS `position: sticky` with `top` offset calculated to position it immediately below the main header. Z-index layering:

- Main Header: `z-index: 100`
- Secondary Header: `z-index: 90`
- Page Content: `z-index: 1`

### File Organization

```
public/
├── css/
│   ├── style.css (existing - contains theme variables)
│   └── secondary-header.css (new - component styles)
├── js/
│   └── secondary-header.js (new - active state detection)
└── index.html (updated to include secondary header)
└── view_project_details.html (updated to include secondary header)
```

## Components and Interfaces

### HTML Structure

```html
<nav class="secondary-header" aria-label="Secondary navigation">
  <div class="secondary-header-container">
    <a href="index.html" class="nav-item" data-page="index">
      <span class="nav-icon">🏠</span>
      <span class="nav-label">Home</span>
    </a>
    <a href="view_project_details.html" class="nav-item" data-page="project-detail">
      <span class="nav-icon">📄</span>
      <span class="nav-label">Project Detail</span>
    </a>
    <div class="nav-item nav-item-disabled" aria-label="AI Chatbot coming soon">
      <span class="nav-icon">🤖</span>
      <span class="nav-label">AI Chatbot</span>
      <span class="coming-soon-badge">Soon</span>
    </div>
  </div>
</nav>
```

### CSS Architecture

#### CSS Custom Properties

The component leverages existing CSS custom properties from `style.css`:

```css
/* Light Mode */
--surface: #ffffff
--text-primary: #0f172a
--text-secondary: #475569
--border: #e2e8f0
--primary-color: #6366f1
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1)

/* Dark Mode ([data-theme="dark"]) */
--surface: #1e293b
--text-primary: #f1f5f9
--text-secondary: #cbd5e1
--border: #334155
--primary-color: #818cf8
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4)
```

#### Component Styles (secondary-header.css)

```css
.secondary-header {
  position: sticky;
  top: 72px; /* Adjusted based on main header height */
  z-index: 90;
  display: flex;
  justify-content: center;
  padding: 1rem 0;
  background: transparent;
  pointer-events: none; /* Allow clicks to pass through transparent areas */
}

.secondary-header-container {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 9999px; /* Fully rounded pill shape */
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(8px);
  pointer-events: auto; /* Restore click handling on container */
  transition: all 0.3s ease;
}

[data-theme="dark"] .secondary-header-container {
  background: rgba(30, 41, 59, 0.7);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  text-decoration: none;
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 0.95rem;
  transition: all 0.3s ease;
  cursor: pointer;
  white-space: nowrap;
}

.nav-item:hover:not(.nav-item-disabled) {
  background: var(--border);
  color: var(--text-primary);
  transform: translateY(-2px);
}

.nav-item:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.nav-item.active {
  background: var(--primary-color);
  color: white;
}

.nav-item-disabled {
  opacity: 0.6;
  cursor: not-allowed;
  position: relative;
}

.coming-soon-badge {
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  color: white;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
}

/* Responsive Design */
@media (max-width: 768px) {
  .secondary-header {
    top: 68px; /* Adjusted for smaller header on mobile */
  }
  
  .nav-label {
    display: none; /* Hide labels on mobile, keep icons only */
  }
  
  .nav-item {
    padding: 0.5rem;
  }
  
  .nav-icon {
    font-size: 1.25rem;
  }
}
```

### JavaScript Interface (secondary-header.js)

```javascript
/**
 * Detects the current page and applies the active state to the corresponding nav item
 */
function initSecondaryHeader() {
  const currentPath = window.location.pathname;
  const fileName = currentPath.substring(currentPath.lastIndexOf('/') + 1);
  
  // Map page filenames to data-page attributes
  const pageMap = {
    'index.html': 'index',
    '': 'index', // Root path
    'view_project_details.html': 'project-detail'
  };
  
  const currentPage = pageMap[fileName] || pageMap[''];
  
  // Find and activate the corresponding nav item
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  navItems.forEach(item => {
    if (item.dataset.page === currentPage) {
      item.classList.add('active');
      item.setAttribute('aria-current', 'page');
    }
  });
}

// Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSecondaryHeader);
} else {
  initSecondaryHeader();
}
```

## Data Models

### Navigation Item Structure

```typescript
interface NavigationItem {
  label: string;           // Display text (e.g., "Home", "Project Detail")
  href: string | null;     // Navigation target or null if disabled
  icon: string;            // Emoji or icon representation
  page: string;            // Identifier for active state matching
  disabled: boolean;       // Whether the item is clickable
  badge?: string;          // Optional badge text (e.g., "Soon")
}
```

### Theme State

The component does not maintain its own theme state. It relies on the document-level `[data-theme]` attribute managed by the existing `theme-toggle.js` module.

## Error Handling

### Missing DOM Elements

If the secondary header navigation structure is not found during initialization, the JavaScript should fail silently without blocking page functionality:

```javascript
function initSecondaryHeader() {
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  if (!navItems || navItems.length === 0) {
    console.warn('Secondary header navigation items not found');
    return;
  }
  // Continue initialization...
}
```

### Invalid Page Detection

If the current page does not match any known navigation item, no active state is applied. This is acceptable behavior as it indicates the user is on a page not covered by the secondary navigation.

### CSS Loading Failure

If `secondary-header.css` fails to load, the component will degrade gracefully:
- HTML structure remains accessible (semantic navigation)
- Links remain functional
- Only visual styling is lost

### Z-Index Conflicts

If future components introduce z-index values between 90-100, visual stacking issues may occur. The solution is to:
1. Maintain a z-index reference in `style.css` comments
2. Adjust the secondary header's z-index accordingly
3. Ensure main header always has higher z-index than secondary header

## Testing Strategy

Since this feature is primarily UI rendering and layout with minimal logic, **Property-Based Testing is NOT applicable**. The testing strategy focuses on:

### Unit Tests

Unit tests will verify:
- **Active state detection logic**: Test that `initSecondaryHeader()` correctly identifies current page from various URL patterns
- **Page mapping**: Verify the `pageMap` correctly maps filenames to `data-page` values
- **DOM manipulation**: Confirm that active classes and aria attributes are applied correctly

Example test cases:
- When on `index.html`, the Home nav item receives the `active` class
- When on `view_project_details.html`, the Project Detail nav item receives `aria-current="page"`
- When on an unknown page, no nav item receives the active state

### Integration Tests

Integration tests will verify:
- **Navigation functionality**: Clicking nav items navigates to correct pages
- **Theme system integration**: Component colors update when theme changes
- **Sticky positioning**: Component remains visible during scroll
- **Responsive behavior**: Layout adjusts correctly at mobile breakpoint (768px)

Example test cases:
- Clicking Home nav item loads `index.html`
- Clicking AI Chatbot does not navigate (disabled state)
- Changing theme from light to dark updates component background color within 300ms

### Visual Regression Tests

Visual regression tests will verify:
- **Appearance consistency**: Component renders identically across browsers
- **Theme styling**: Both light and dark themes display correctly
- **Hover states**: Hover effects render as designed
- **Responsive layouts**: Mobile and desktop views match design specifications

Tools: Playwright or Cypress for screenshot comparison

### Accessibility Tests

Accessibility tests will verify:
- **Keyboard navigation**: Tab key navigates through all nav items
- **Focus indicators**: Visible focus ring appears on focused items
- **Screen reader compatibility**: Aria attributes are correctly announced
- **Semantic structure**: Navigation uses proper `<nav>` and link elements

Tools: Axe DevTools or Lighthouse for automated accessibility checks

### Manual Testing Checklist

- [ ] Component appears below main header on all pages
- [ ] Active state reflects current page
- [ ] Hover effects display smoothly
- [ ] Clicking disabled AI Chatbot item does nothing
- [ ] Component remains sticky during scroll
- [ ] Theme toggle updates component colors
- [ ] Mobile view hides text labels, shows icons only
- [ ] Component does not cause horizontal scroll on small screens
- [ ] Focus indicator visible when tabbing through items

### Test Environment

- **Browsers**: Chrome, Firefox, Safari, Edge (latest versions)
- **Devices**: Desktop (1920x1080), Tablet (768x1024), Mobile (375x667)
- **Themes**: Light mode and dark mode
- **JavaScript States**: With and without JS enabled (graceful degradation)

