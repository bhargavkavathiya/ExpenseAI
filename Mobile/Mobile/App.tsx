import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";

import AckScreen from "@/screens/AckScreen";
import DashboardScreen from "@/screens/DashboardScreen";
import LoginScreen from "@/screens/LoginScreen";
import MyExpensesScreen from "@/screens/MyExpensesScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import RegisterScreen from "@/screens/RegisterScreen";
import ResultScreen from "@/screens/ResultScreen";
import SplashScreen from "@/screens/SplashScreen";
import SubmitScreen from "@/screens/SubmitScreen";

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
  Dashboard: undefined;
  Submit: undefined;
  Ack: { refId: string };
  Result: { refId: string };
  MyExpenses: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerStyle: { backgroundColor: "#1a237e" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "800", fontSize: 16 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: "#f1f3f9" },
        }}
      >
        <Stack.Screen name="Splash"     component={SplashScreen}     options={{ headerShown: false, animation: "none" }} />
        <Stack.Screen name="Login"      component={LoginScreen}      options={{ headerShown: false, animation: "fade" }} />
        <Stack.Screen name="Register"   component={RegisterScreen}   options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="Dashboard"  component={DashboardScreen}  options={{ title: "Dashboard", animation: "fade" }} />
        <Stack.Screen name="Submit"     component={SubmitScreen}     options={{ title: "Submit Receipt", animation: "slide_from_right" }} />
        <Stack.Screen name="Ack"        component={AckScreen}        options={{ title: "Processing…", headerBackVisible: false, animation: "fade" }} />
        <Stack.Screen name="Result"     component={ResultScreen}     options={{ title: "Audit Result", animation: "slide_from_bottom" }} />
        <Stack.Screen name="MyExpenses" component={MyExpensesScreen} options={{ title: "My Expenses", animation: "slide_from_right" }} />
        <Stack.Screen name="Profile"    component={ProfileScreen}    options={{ title: "My Profile", animation: "slide_from_right" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
