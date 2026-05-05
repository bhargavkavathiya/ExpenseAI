import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'

import LoginScreen from './screens/LoginScreen'
import HomeScreen from './screens/HomeScreen'
import UploadReceiptScreen from './screens/UploadReceiptScreen'
import AcknowledgementScreen from './screens/AcknowledgementScreen'
import ResultScreen from './screens/ResultScreen'

const Stack = createStackNavigator()

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: '#1a237e' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Upload" component={UploadReceiptScreen} options={{ title: 'Submit Expense' }} />
        <Stack.Screen name="Acknowledgement" component={AcknowledgementScreen} options={{ title: 'Submission Confirmed', headerLeft: null }} />
        <Stack.Screen name="Result" component={ResultScreen} options={{ title: 'AI Audit Result' }} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
