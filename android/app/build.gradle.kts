plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val defaultServerUrl = (project.findProperty("ASTROBOT_SERVER_URL") as String?)
    ?: "https://ais-pre-im7s7clnxulq5m2jb4h6c2-127058870116.us-west2.run.app"

android {
    namespace = "com.sh.astrobot.ai"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.sh.astrobot.ai"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "DEFAULT_SERVER_URL", "\"$defaultServerUrl\"")
        buildConfigField("String", "USB_LOCAL_URL", "\"http://127.0.0.1:3000\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isDebuggable = true
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
