// Gradle init script to bypass SSL certificate validation
// This is a workaround for certificate path issues

allprojects {
    buildscript {
        repositories {
            all { 
                if (this is MavenArtifactRepository) {
                    isAllowInsecureProtocol = true
                }
            }
        }
    }
    
    repositories {
        all { 
            if (this is MavenArtifactRepository) {
                isAllowInsecureProtocol = true
            }
        }
    }
}
