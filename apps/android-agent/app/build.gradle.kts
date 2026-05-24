plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.asashiki.agent"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.asashiki.agent"
        minSdk = 28
        targetSdk = 36
        // CI passes -PversionCode=<github.run_number>. Add base offset 1000 so we always
        // stay above any past local builds and to leave headroom against version downgrades.
        val ciCode = (project.findProperty("versionCode") as String?)?.toIntOrNull() ?: 0
        versionCode = ciCode + 1000
        versionName = "1.0.${versionCode}"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    val keystorePath = project.findProperty("keystorePath") as String?
    if (keystorePath != null) {
        signingConfigs {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = project.findProperty("keystorePassword") as String?
                keyAlias = project.findProperty("keyAlias") as String?
                keyPassword = project.findProperty("keyPassword") as String?
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (keystorePath != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    // Two flavors share the same applicationId so users install only the one they want.
    // - full: phone build, includes chat UI + voice playback
    // - lite: tablet build, settings + data collection only
    flavorDimensions += "edition"
    productFlavors {
        create("full") {
            dimension = "edition"
            buildConfigField("boolean", "INCLUDE_CHAT", "true")
            resValue("string", "app_name", "Asashiki Agent")
        }
        create("lite") {
            dimension = "edition"
            buildConfigField("boolean", "INCLUDE_CHAT", "false")
            resValue("string", "app_name", "Asashiki Agent Lite")
            versionNameSuffix = "-lite"
        }
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // Compose (from live-dashboard)
    implementation(platform("androidx.compose:compose-bom:2024.09.03"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.lifecycle:lifecycle-service:2.8.6")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // HTTP (from live-dashboard)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // WorkManager (for HealthConnect periodic sync)
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // Location (FusedLocationProviderClient + ActivityRecognition)
    implementation("com.google.android.gms:play-services-location:21.3.0")

    // HealthConnect
    implementation("androidx.health.connect:connect-client:1.1.0-rc01")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
