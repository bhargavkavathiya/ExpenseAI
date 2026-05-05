import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, View, ImageBackground } from "react-native";

import type { RootStackParamList } from "../../App";
import AppLogo from "@/components/AppLogo";
import { getToken } from "@/api";

type Props = NativeStackScreenProps<RootStackParamList, "Splash">;

const { width } = Dimensions.get("window");

export default function SplashScreen({ navigation }: Props) {
  const logoScale   = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const tagOpacity  = useRef(new Animated.Value(0)).current;
  const barWidth    = useRef(new Animated.Value(0)).current;
  const dot1        = useRef(new Animated.Value(0.3)).current;
  const dot2        = useRef(new Animated.Value(0.3)).current;
  const dot3        = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Logo entrance
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      // App name fade in
      Animated.timing(textOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      // Tagline fade in
      Animated.timing(tagOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    // Progress bar
    Animated.timing(barWidth, {
      toValue: width * 0.55,
      duration: 2200,
      delay: 400,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false,
    }).start();

    // Dot pulse loop
    const pulseDots = () => {
      Animated.sequence([
        Animated.timing(dot1, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(dot2, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(dot3, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(dot1, { toValue: 0.3, duration: 200, useNativeDriver: true }),
          Animated.timing(dot2, { toValue: 0.3, duration: 200, useNativeDriver: true }),
          Animated.timing(dot3, { toValue: 0.3, duration: 200, useNativeDriver: true }),
        ]),
      ]).start(({ finished }) => { if (finished) pulseDots(); });
    };
    const dotTimer = setTimeout(pulseDots, 800);

    // Navigate after delay
    const checkAuth = async () => {
      const token = await getToken();
      if (token) {
        navigation.replace("Dashboard");
      } else {
        navigation.replace("Login");
      }
    };

    const nav = setTimeout(checkAuth, 2600);
    return () => { clearTimeout(nav); clearTimeout(dotTimer); };
  }, []);

  return (
    <ImageBackground source={require("../../assets/splash-icon.png")} style={styles.root} resizeMode="cover">
      <View style={styles.overlay}>
      {/* Center content */}
      <View style={styles.center}>
        <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity }}>
          <AppLogo size="xl" />
        </Animated.View>

        <Animated.Text style={[styles.appName, { opacity: textOpacity }]}>
          ExpenseIQ Pro
        </Animated.Text>

        <Animated.Text style={[styles.tagline, { opacity: tagOpacity }]}>
          AI-Powered Receipt Compliance
        </Animated.Text>

        {/* Progress bar */}
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width: barWidth }]} />
        </View>

        {/* Dots */}
        <View style={styles.dots}>
          {([dot1, dot2, dot3] as Animated.Value[]).map((d, i) => (
            <Animated.View key={i} style={[styles.dot, { opacity: d }]} />
          ))}
        </View>
      </View>

      {/* Bottom branding */}
      <View style={styles.bottom}>
        <Text style={styles.bottomText}>Powered by AI · Secure · Compliant</Text>
        <Text style={styles.version}>v1.0.0</Text>
      </View>
    </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0d1547",
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(13, 21, 71, 0.4)", // Dark tint to make text readable over the image
    alignItems: "center",
    justifyContent: "center",
  },

  center: {
    alignItems: "center",
    gap: 16,
  },

  appName: {
    fontSize: 32,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.5,
    marginTop: 8,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  tagline: {
    fontSize: 14,
    color: "#90caf9",
    fontWeight: "500",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: -6,
  },

  barTrack: {
    width: width * 0.55,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 2,
    marginTop: 24,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: "#7c3aed",
    borderRadius: 2,
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },

  dots: {
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#7c3aed",
  },

  bottom: {
    position: "absolute",
    bottom: 44,
    alignItems: "center",
    gap: 4,
  },
  bottomText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 0.5,
  },
  version: {
    fontSize: 10,
    color: "rgba(255,255,255,0.2)",
  },
});
