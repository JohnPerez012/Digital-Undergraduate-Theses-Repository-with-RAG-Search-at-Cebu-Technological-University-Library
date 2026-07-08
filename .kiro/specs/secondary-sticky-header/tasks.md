# Implementation Plan: Secondary Sticky Header

## Overview

This implementation plan creates a floating secondary navigation header positioned below the main header. The component provides quick access to Home, Project Detail, and AI Chatbot (coming soon) sections. Implementation follows a modular approach with separate CSS and JavaScript files, ensuring theme compatibility and responsive design.

## Tasks

- [x] 1. Create secondary header CSS file with component styling
  - Create `public/css/secondary-header.css`
  - Define `.secondary-header` and `.secondary-header-container` styles with sticky positioning
  - Implement pill-shaped design with border-radius, shadows, and glassmorphism effects
  - Add `.nav-item` styles with hover states, active states, and disabled states
  - Include `.coming-soon-badge` styles with gradient background
  - Define responsive styles with mobile breakpoint at 768px (hide labels, adjust icon sizes)
  - Use existing CSS custom properties from `style.css` (--surface, --text-primary, --text-secondary, --border, --primary-color, --shadow-md)
  - Add smooth transitions (300ms) for all interactive states
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 5.2, 5.3, 5.4, 6.3, 6.4_

- [x] 2. Create secondary header JavaScript for active state detection
  - Create `public/js/secondary-header.js`
  - Implement `initSecondaryHeader()` function that detects current page from `window.location.pathname`
  - Create page mapping logic (`pageMap`) to match filenames to `data-page` attributes
  - Add logic to apply `.active` class and `aria-current="page"` to matching navigation items
  - Handle edge cases: root path, unknown pages, missing DOM elements
  - Initialize on DOM load with proper event listener handling
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 9.3_

- [ ]* 2.1 Write unit tests for active state detection
  - Test page mapping for index.html, root path, and view_project_details.html
  - Test that correct nav item receives active class for each page
  - Test that aria-current attribute is correctly applied
  - Test graceful handling when no nav items match current page
  - Test graceful failure when DOM elements are missing
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Add secondary header HTML structure to index.html
  - Insert secondary header `<nav>` element below main header in `public/index.html`
  - Include three nav items: Home (href="index.html", data-page="index"), Project Detail (href="view_project_details.html", data-page="project-detail"), AI Chatbot (disabled with coming-soon badge)
  - Add semantic HTML structure with proper aria-label on nav element
  - Link `secondary-header.css` in the `<head>` section
  - Link `secondary-header.js` before closing `</body>` tag
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 9.1, 10.3, 10.5_

- [x] 4. Add secondary header HTML structure to view_project_details.html
  - Insert identical secondary header `<nav>` element below main header in `public/view_project_details.html`
  - Include three nav items with same structure as index.html
  - Link `secondary-header.css` in the `<head>` section
  - Link `secondary-header.js` before closing `</body>` tag
  - Ensure HTML structure matches index.html for consistency
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 9.1, 10.3, 10.5_

- [x] 5. Checkpoint - Verify basic rendering and navigation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement z-index layering and positioning
  - Verify main header has z-index: 100
  - Confirm secondary header has z-index: 90
  - Calculate and set `top` value for sticky positioning (72px for desktop, 68px for mobile)
  - Test that secondary header stays below main header during scroll
  - Test that secondary header stays above page content
  - _Requirements: 1.1, 1.5, 4.1, 4.2, 4.3, 4.4_

- [ ]* 6.1 Write integration tests for sticky positioning
  - Test that component remains visible during page scroll
  - Test that component maintains position below main header
  - Test that z-index layering is correct (main header > secondary header > content)
  - Test position values at desktop and mobile breakpoints
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 7. Implement theme system integration
  - Verify secondary header uses CSS custom properties from style.css
  - Test color transitions when `[data-theme]` attribute changes
  - Verify dark theme applies `rgba(30, 41, 59, 0.7)` background to container
  - Ensure all color values reference CSS custom properties (no hard-coded colors)
  - Test visual contrast in both light and dark modes
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]* 7.1 Write integration tests for theme integration
  - Test that component colors update when theme changes from light to dark
  - Test that theme transition completes within 300ms
  - Test that all color properties use CSS custom properties
  - Test visual contrast meets accessibility standards in both themes
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 8. Implement responsive design for mobile devices
  - Test layout at 768px breakpoint
  - Verify nav labels are hidden on screens ≤768px
  - Verify nav icons scale to 1.25rem on mobile
  - Confirm no horizontal scrolling occurs on small screens (375px width)
  - Test that component remains centered on all screen sizes
  - Adjust sticky `top` value for mobile (68px)
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ]* 8.1 Write integration tests for responsive behavior
  - Test layout changes at 768px breakpoint
  - Test that labels are hidden on mobile viewports
  - Test that component width adapts without causing horizontal scroll
  - Test centering on screens from 375px to 1920px
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 9. Implement accessibility features
  - Add keyboard focus styles with visible outline (2px solid primary-color)
  - Verify Tab key navigation works through all nav items
  - Add `aria-label="Secondary navigation"` to nav element
  - Add `aria-label="AI Chatbot coming soon"` to disabled nav item
  - Verify `aria-current="page"` is applied by JavaScript to active item
  - Test keyboard navigation flow and focus indicators
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ]* 9.1 Write accessibility tests
  - Test keyboard navigation with Tab key through all nav items
  - Test that focus indicators are visible and meet WCAG contrast requirements
  - Test that aria attributes are correctly applied and announced by screen readers
  - Test that disabled nav item is properly indicated to assistive technologies
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 10. Final integration and verification
  - Test navigation functionality (clicking Home and Project Detail links)
  - Verify AI Chatbot item does not navigate when clicked
  - Test active state updates correctly when navigating between pages
  - Verify hover effects display smoothly with 300ms transitions
  - Test that component does not interfere with existing page functionality
  - Verify component separation (CSS, JS, HTML are modular and reusable)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.3, 5.4, 10.1, 10.2, 10.3, 10.4_

- [ ]* 10.1 Write end-to-end integration tests
  - Test complete navigation flow from index.html to view_project_details.html
  - Test that active state updates after navigation
  - Test that all interactive states work together (hover, active, focus, theme)
  - Test graceful degradation when JavaScript is disabled
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 5.1, 5.4, 6.4_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The design uses HTML/CSS/JavaScript, so all implementation follows web standards
- No property-based tests are needed since this is primarily UI rendering and layout
- Testing strategy focuses on unit tests for JavaScript logic and integration tests for UI behavior
- Each task references specific requirements for traceability
- Component uses existing CSS custom properties from style.css for consistent theming
- Z-index values: Main Header (100), Secondary Header (90), Page Content (1)
- Mobile breakpoint: 768px
- Transition duration: 300ms for all interactive states

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["2.1", "3", "4"] },
    { "id": 2, "tasks": ["6", "7", "8"] },
    { "id": 3, "tasks": ["6.1", "7.1", "8.1", "9"] },
    { "id": 4, "tasks": ["9.1", "10"] },
    { "id": 5, "tasks": ["10.1"] }
  ]
}
```
