/**
 * Icon Generator Script for HydroTrack
 * 
 * This script generates all required Android launcher icons from logo.png
 * 
 * Requirements:
 * - Install sharp: npm install sharp
 * - Run: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.error('❌ Sharp is not installed. Please install it first:');
  console.error('   npm install sharp');
  process.exit(1);
}

const SOURCE_LOGO = path.join(__dirname, '..', 'logo.png');

// Android launcher icon sizes
const ANDROID_ICONS = [
  // Regular launcher icons
  { size: 48, folder: 'mipmap-mdpi', name: 'ic_launcher.png' },
  { size: 72, folder: 'mipmap-hdpi', name: 'ic_launcher.png' },
  { size: 96, folder: 'mipmap-xhdpi', name: 'ic_launcher.png' },
  { size: 144, folder: 'mipmap-xxhdpi', name: 'ic_launcher.png' },
  { size: 192, folder: 'mipmap-xxxhdpi', name: 'ic_launcher.png' },
  
  // Foreground icons (adaptive icons)
  { size: 108, folder: 'mipmap-mdpi', name: 'ic_launcher_foreground.png' },
  { size: 162, folder: 'mipmap-hdpi', name: 'ic_launcher_foreground.png' },
  { size: 216, folder: 'mipmap-xhdpi', name: 'ic_launcher_foreground.png' },
  { size: 324, folder: 'mipmap-xxhdpi', name: 'ic_launcher_foreground.png' },
  { size: 432, folder: 'mipmap-xxxhdpi', name: 'ic_launcher_foreground.png' },
  
  // Round launcher icons
  { size: 48, folder: 'mipmap-mdpi', name: 'ic_launcher_round.png' },
  { size: 72, folder: 'mipmap-hdpi', name: 'ic_launcher_round.png' },
  { size: 96, folder: 'mipmap-xhdpi', name: 'ic_launcher_round.png' },
  { size: 144, folder: 'mipmap-xxhdpi', name: 'ic_launcher_round.png' },
  { size: 192, folder: 'mipmap-xxxhdpi', name: 'ic_launcher_round.png' },
];

// PWA icons
const PWA_ICONS = [
  { size: 64, name: 'icon-64.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 512, name: 'icon-512-maskable.png' },
];

async function generateAndroidIcons() {
  console.log('📱 Generating Android launcher icons...\n');
  
  if (!fs.existsSync(SOURCE_LOGO)) {
    console.error(`❌ Source logo not found: ${SOURCE_LOGO}`);
    process.exit(1);
  }

  let successCount = 0;
  let errorCount = 0;

  for (const icon of ANDROID_ICONS) {
    try {
      const outputDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', icon.folder);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = path.join(outputDir, icon.name);

      await sharp(SOURCE_LOGO)
        .resize(icon.size, icon.size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputPath);

      console.log(`✓ ${icon.folder}/${icon.name} (${icon.size}×${icon.size})`);
      successCount++;
    } catch (error) {
      console.error(`✗ ${icon.folder}/${icon.name} - ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\n📱 Android icons: ${successCount} generated, ${errorCount} failed`);
}

async function generatePWAIcons() {
  console.log('\n🌐 Generating PWA icons...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const icon of PWA_ICONS) {
    try {
      const outputDir = path.join(__dirname, '..', 'assets', 'icons');
      const outputPath = path.join(outputDir, icon.name);

      await sharp(SOURCE_LOGO)
        .resize(icon.size, icon.size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputPath);

      console.log(`✓ ${icon.name} (${icon.size}×${icon.size})`);
      successCount++;
    } catch (error) {
      console.error(`✗ ${icon.name} - ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\n🌐 PWA icons: ${successCount} generated, ${errorCount} failed`);
}

async function main() {
  console.log('🎨 HydroTrack Icon Generator\n');
  console.log(`Source: ${SOURCE_LOGO}\n`);
  console.log('━'.repeat(60));

  try {
    await generateAndroidIcons();
    await generatePWAIcons();
    
    console.log('\n' + '━'.repeat(60));
    console.log('✅ Icon generation complete!\n');
    console.log('Next steps:');
    console.log('1. Run: npx cap sync android');
    console.log('2. Build APK: cd android && ./gradlew assembleDebug\n');
  } catch (error) {
    console.error('\n❌ Error generating icons:', error.message);
    process.exit(1);
  }
}

main();
