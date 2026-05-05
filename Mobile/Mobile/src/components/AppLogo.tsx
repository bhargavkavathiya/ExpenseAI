import { Image, StyleSheet, View } from "react-native";

type Size = "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, { box: number; radius: number; icon: number }> = {
  sm: { box: 44,  radius: 12, icon: 20 },
  md: { box: 64,  radius: 18, icon: 30 },
  lg: { box: 80,  radius: 22, icon: 38 },
  xl: { box: 110, radius: 28, icon: 52 },
};

export default function AppLogo({ size = "md" }: { size?: Size }) {
  const { box, radius, icon } = SIZES[size];
  return (
    <View style={[styles.box, { width: box, height: box, borderRadius: radius, overflow: "hidden" }]}>
      <Image 
        source={require("../../assets/icon.png")} 
        style={{ width: "100%", height: "100%", resizeMode: "cover" }} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: "#1a237e",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1a237e",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  receipt: {
    backgroundColor: "#fff",
    borderRadius: 3,
    padding: 4,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  line: {
    height: 2,
    backgroundColor: "#1a237e",
    borderRadius: 1,
    opacity: 0.7,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "#1a237e",
    opacity: 0.3,
  },
  spark: {
    position: "absolute",
    backgroundColor: "#7c3aed",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 6,
  },
});
