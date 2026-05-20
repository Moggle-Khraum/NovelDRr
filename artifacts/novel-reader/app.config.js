// app.config.js
export default () => {
  const buildNumber = process.env.APP_BUILD_NUMBER || '1';

  return {
    expo: {
      name: "Novel DR",
      slug: "novel-reader",
      version: "2.5.18",
      orientation: "portrait",
      icon: "./assets/images/icon.png",
      scheme: "novel-reader",
      userInterfaceStyle: "automatic",
      newArchEnabled: true,
      splash: {
        image: "./assets/images/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff"
      },
      ios: {
        supportsTablet: false,
        buildNumber: buildNumber                       // ← adds build number for iOS
      },
      android: {
        package: "com.noveldr.app",
        versionCode: parseInt(buildNumber, 10)        // ← adds version code for Android
      },
      web: {
        favicon: "./assets/images/icon.png"
      },
      plugins: [
        [
          "expo-router",
          {
            origin: "https://replit.com/"
          }
        ],
        "expo-font",
        "expo-web-browser"
      ],
      experiments: {
        typedRoutes: true,
        reactCompiler: true
      }
    }
  };
};
