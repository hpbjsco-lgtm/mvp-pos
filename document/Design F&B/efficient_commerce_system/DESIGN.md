---
name: Efficient Commerce System
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#404750'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#707881'
  outline-variant: '#c0c7d1'
  surface-tint: '#00639a'
  primary: '#005889'
  on-primary: '#ffffff'
  primary-container: '#0071af'
  on-primary-container: '#e3efff'
  inverse-primary: '#96ccff'
  secondary: '#006d37'
  on-secondary: '#ffffff'
  secondary-container: '#7bf8a1'
  on-secondary-container: '#007239'
  tertiary: '#804400'
  on-tertiary: '#ffffff'
  tertiary-container: '#a25909'
  on-tertiary-container: '#ffeadc'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cee5ff'
  primary-fixed-dim: '#96ccff'
  on-primary-fixed: '#001d32'
  on-primary-fixed-variant: '#004a75'
  secondary-fixed: '#7efba4'
  secondary-fixed-dim: '#61de8a'
  on-secondary-fixed: '#00210c'
  on-secondary-fixed-variant: '#005228'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  button-text:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  touch-target-min: 48px
  gutter: 16px
  margin-mobile: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style

The design system is engineered for high-velocity retail environments where speed, accuracy, and reliability are paramount. The brand personality is **functional, trustworthy, and efficient**, focusing on reducing cognitive load for staff during peak hours. 

The aesthetic follows a **Corporate / Modern** style, utilizing a "clean-room" approach: expansive white surfaces, high-contrast action colors, and a rigid adherence to functional hierarchy. Every visual element exists to facilitate a transaction or provide immediate status clarity. The interface prioritizes utility over decoration, ensuring the POS remains performant and legible under diverse lighting conditions (from bright storefronts to dimly lit warehouses).

## Colors

The palette is anchored by **Primary Blue (#0071AF)**, conveying professionalism and stability. Semantic colors are strictly enforced to guide user behavior:

- **Primary Blue:** Used for navigation, selection states, and primary administrative actions.
- **Success Green (#27AE60):** Reserved exclusively for the "Thanh toán" (Payment) flow and completed states. This provides a high-confidence visual cue for closing a sale.
- **Warning Orange (#F2994A):** Applied to pending orders, low stock alerts, or items requiring attention.
- **Neutral Backgrounds:** A clean `#FFFFFF` base for cards and inputs, with `#F8F9FA` for page backgrounds to provide subtle contrast for elevated elements.
- **Typography:** Deep charcoal (#1A1C1E) for maximum legibility against white backgrounds.

## Typography

This design system utilizes **Inter** for its exceptional legibility and modern, systematic feel. To accommodate fast-paced mobile usage, font sizes are oversized compared to standard mobile apps.

- **Minimum Legibility:** The absolute minimum font size for critical data (prices, quantities) is 16px.
- **Action Hierarchy:** Buttons and page titles use 18px-24px to ensure they are readable at arm's length.
- **Numeric Clarity:** Numbers (prices, SKUs) should utilize tabular lining figures where available to ensure vertical alignment in lists.
- **Contrast:** High-weight fonts (600+) are used for headings and labels to maintain clarity against vibrant semantic colors.

## Layout & Spacing

The layout utilizes a **fluid grid** approach for mobile, with a focus on vertical stackability. 

- **Touch Safety:** A strict minimum touch target of 48x48px is enforced for all interactive elements.
- **Gutter & Margins:** A consistent 16px margin wraps the screen. 16px gutters separate list items and card elements.
- **Mobile POS View:** The "Cart" or "Ticket" view should occupy the bottom third of the screen in a sticky panel, allowing the top two-thirds for product selection or search.
- **Scanning Context:** Key data points (Total Price) must be positioned in the "thumb zone" (bottom half of the screen) for ergonomic one-handed operation.

## Elevation & Depth

This design system uses **Tonal Layers** combined with **Ambient Shadows** to define hierarchy.

- **Level 0 (Background):** `#F8F9FA`. Used for the main app canvas.
- **Level 1 (Surface):** `#FFFFFF`. Used for product cards, list items, and input containers.
- **Shadows:** Use extremely soft, diffused shadows (Blur: 12px, Y: 4px, Opacity: 6% Black) to lift cards off the background without creating visual clutter.
- **Active State:** Elements being pressed or selected should lose their shadow and slightly darken (inner-glow effect) to provide tactile feedback.

## Shapes

The shape language is **Soft**, utilizing a 0.25rem (4px) base radius. This provides a balance between the precision of a professional tool and the approachability of a modern mobile app.

- **Standard Elements:** 4px radius for input fields and small buttons.
- **Cards & Large Buttons:** 8px (rounded-lg) to distinguish major functional areas.
- **Full-width Elements:** Top or bottom sheets use 12px (rounded-xl) only on the internal corners.

## Components

### Buttons
- **Primary Action (Payment):** Success Green background, White text, 18px Bold. Minimum height 56px.
- **Secondary Action (Edit/Note):** Neutral Light Grey background, Blue text. Minimum height 48px.
- **Quantity Adjusters:** Large +/- stepper buttons with a minimum 50px width for easy tapping.

### Input Fields
- **Search:** Persistent top-bar placement, 16px text, clear "X" icon for resetting.
- **Numeric Input:** Always triggers a large-format decimal keypad. Borders are 1px solid Grey-300, turning Primary Blue on focus.

### Cards & Lists
- **Product Card:** White background, subtle shadow. Image on left (if available), Title and Price stacked on right.
- **Cart Item:** Full-width row with swipe-to-delete gesture support. Price and Quantity must be high-contrast (Bold, 18px).

### Chips & Status Labels
- **Pending Status:** Warning Orange background with high-contrast text. 
- **Category Chips:** Filter chips use Primary Blue for the active state and a light grey for inactive.

### Additional Components
- **Sticky Footer Summary:** A high-elevation bar at the bottom showing "Total Items" and "Grand Total" with the "Thanh toán" button integrated.