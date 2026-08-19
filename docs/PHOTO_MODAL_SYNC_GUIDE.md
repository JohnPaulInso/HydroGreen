# Photo Modal Sync & Navigation Guide

## Feature Overview
Complete synchronization between photo detail modal and fullscreen zoom viewer with smart album bar centering.

---

## 🎯 How It Works

### Opening a Photo
```
Gallery Grid → Click Photo #8 → Opens photoDetailModal showing Photo #8
    ↓
Tap to Zoom → Opens Fullscreen Viewer
    ↓
Album Bar Appears → Photo #8 centered & highlighted
```

### The Album Bar
```
┌─────────────────────────────────────────────┐
│  [ ] [ ] [ ] [🟢] [ ] [ ] [ ]               │  ← Automatically centered on active
│   5   6   7   8   9  10  11                  │
└─────────────────────────────────────────────┘
     ↖ visible    active    visible ↗
```

### Navigation Flow
```
Swipe Left → Move to Photo #9
    ↓
Album Bar Smoothly Scrolls → Photo #9 now centered
    ↓
Visual Feedback → Green border moves to #9
    ↓
Previous #8 → Fades to white border
```

---

## 📱 User Interactions

### 1. **In Photo Detail Modal** (`photoDetailModal`)
- **Swipe Left/Right**: Navigate between photos
- **Swipe Down**: Close modal (120px threshold)
- **Tap Photo**: Open fullscreen zoom viewer
- **Arrow Buttons**: Navigate to next/prev photo

### 2. **In Fullscreen Viewer** (`zoomImgWrapper`)
- **Single Tap**: Toggle album bar & header visibility
- **Double Tap**: Zoom in/out (1x ↔ 4x)
- **Pinch**: Zoom with precision (1x to 6x)
- **Drag** (when zoomed): Pan around photo
- **Swipe Left/Right**: Navigate to next/prev
- **Swipe Down**: Close viewer (120px threshold)

### 3. **In Album Bar** (`fullscreenAlbumBar`)
- **Tap Thumbnail**: Jump to that photo instantly
- **Scroll**: Manually browse thumbnails
- **Auto-Scroll**: Follows active photo automatically

---

## 🎨 Visual States

### Active Thumbnail (Current Photo)
```css
✓ Green border (border-emerald-400)
✓ Scaled up 5% (scale-105)
✓ Shadow effect
✓ Ring glow
✓ Full opacity
```

### Inactive Thumbnails
```css
○ White/transparent border
○ Normal scale
○ 50% opacity
○ Hover: 100% opacity
```

---

## 🔄 Sync Behavior

### State Preservation
| Action | Result |
|--------|--------|
| Open Photo #12 | Modal shows #12, Album bar centers on #12 |
| Navigate to #13 | Both modal and album bar update to #13 |
| Close & Reopen | Reopens at #13 (last viewed position) |
| Zoom In/Out | Album bar stays at #13 |
| Toggle Album Bar | Position remains at #13 |

### Scroll Timing
```
Photo Change Event
    ↓
Wait 100ms (DOM paint)
    ↓
Calculate scroll position
    ↓
Smooth scroll (300ms animation)
    ↓
Thumbnail centered ✓
```

---

## 🎯 Centering Algorithm

```javascript
// Calculate horizontal center position
const containerWidth = scrollContainer.clientWidth;
const thumbLeft = activeThumb.offsetLeft;
const thumbWidth = activeThumb.clientWidth;

// Formula: Center of container - Center of thumbnail
const scrollPosition = thumbLeft - (containerWidth / 2) + (thumbWidth / 2);

// Execute smooth scroll
scrollContainer.scrollTo({
  left: scrollPosition,
  behavior: 'smooth'
});
```

### Example Calculation
```
Container Width: 400px
Thumbnail Position: 500px from left
Thumbnail Width: 36px

Center Position = 500 - (400/2) + (36/2)
                = 500 - 200 + 18
                = 318px scroll position

Result: Thumbnail appears at horizontal center
```

---

## 📐 Layout Specifications

### Album Bar Container
- Max width: 384px (max-w-sm)
- Padding: 16px horizontal
- Background: Black 60% opacity + blur
- Border radius: 16px
- Position: Fixed bottom with safe-area inset

### Thumbnail Dimensions
- Size: 36×36px (square)
- Gap: 6px between thumbnails
- Border: 2px solid
- Border radius: 8px
- Transition: all 0.25s ease-out

### Scroll Container
- Overflow: Auto (horizontal only)
- Scrollbar: Hidden (but functional)
- Scroll behavior: Smooth
- Touch: Momentum scrolling enabled

---

## 🐛 Edge Cases Handled

### 1. First Photo (Index 0)
```
Album Bar: [🟢][ ][ ][ ][ ]
Position: Left edge (can't scroll further left)
```

### 2. Last Photo (Index max)
```
Album Bar: [ ][ ][ ][ ][🟢]
Position: Right edge (can't scroll further right)
```

### 3. Few Photos (All fit on screen)
```
Album Bar: [🟢][ ][ ]
Position: No scroll needed (all visible)
```

### 4. Many Photos (20+)
```
Album Bar: Scrolls smoothly to keep active centered
Previous/Next photos partially visible at edges
```

### 5. Rapid Navigation
```
Click Photo #5 → #8 → #12 in quick succession
Result: Each transition animates smoothly
No jarring jumps or scroll conflicts
```

---

## ⚡ Performance Optimizations

### Efficient Rendering
- Only re-renders changed elements
- Uses CSS transforms (GPU-accelerated)
- Minimal DOM manipulations

### Smooth Animations
- Native `scroll-behavior: smooth`
- Hardware-accelerated on iOS
- No JavaScript animation loops

### Memory Management
- Single modal instance (reused)
- Event listeners properly cleaned up
- No memory leaks on modal close

---

## 🎨 Animation Timeline

### Opening Fullscreen Viewer
```
0ms     Modal created, opacity: 0
        ↓
16ms    requestAnimationFrame
        ↓
50ms    Fade in to opacity: 1
        ↓
100ms   Album bar rendered
        ↓
200ms   Auto-scroll to center (300ms smooth)
        ↓
500ms   Fully settled ✓
```

### Navigating Photos
```
0ms     User swipes/clicks
        ↓
50ms    Photo changes, album border updates
        ↓
100ms   scrollToActiveThumb() called
        ↓
400ms   Smooth scroll animation completes
        ↓
400ms   New photo fully visible ✓
```

---

## 📱 Mobile Gestures Summary

| Gesture | Photo Detail Modal | Fullscreen Viewer |
|---------|-------------------|-------------------|
| Swipe ← | Next photo | Next photo |
| Swipe → | Previous photo | Previous photo |
| Swipe ↓ | **Close modal** | **Close viewer** |
| Tap once | Open fullscreen | Toggle UI |
| Tap twice | *(none)* | Zoom in/out |
| Pinch | *(none)* | Zoom control |
| Long press | *(none)* | *(none)* |

---

## 🎯 Success Criteria

✅ **Image Matching**
- Photo shown in modal = Photo shown in fullscreen
- Active thumbnail = Currently displayed photo
- Navigation preserves photo sequence

✅ **Album Bar Centering**
- Active thumbnail always visible
- Smoothly scrolls to center on change
- No jarring jumps or instant teleports

✅ **State Persistence**
- Opening photo #N shows photo #N
- Closing preserves last viewed position
- Album bar remembers scroll position

✅ **Smooth UX**
- All transitions feel natural
- No lag or stuttering
- Touch interactions feel native

---

## 🔍 Testing Scenarios

### Basic Navigation
1. Open photo #10 from gallery
2. Verify album bar shows #10 centered
3. Swipe to #11, check bar scrolls
4. Swipe back to #10, check bar scrolls back

### Edge Cases
1. Open first photo (#0)
2. Verify album bar at left edge
3. Navigate to last photo
4. Verify album bar at right edge

### Rapid Navigation
1. Quickly click thumbnails: #5 → #15 → #3
2. Verify smooth transitions
3. Check no scroll conflicts

### Modal Transitions
1. Open photo detail → Tap to fullscreen
2. Verify same photo shown
3. Navigate in fullscreen
4. Exit to photo detail
5. Verify position preserved
