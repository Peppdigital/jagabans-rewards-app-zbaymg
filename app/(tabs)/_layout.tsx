
import React from 'react';
import { Tabs } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import { colors } from '@/styles/commonStyles';

export default function TabLayout() {
  const tabs: TabBarItem[] = [
    {
      name: '(home)',
      route: '/(tabs)/(home)/',
      icon: 'house.fill',
      label: 'Menu',
    },
    {
      name: 'cart',
      route: '/(tabs)/cart',
      icon: 'cart.fill',
      label: 'Cart',
    },
    {
      name: 'discover',
      route: '/(tabs)/discover',
      icon: 'photo.on.rectangle',
      label: 'Discover',
    },
    {
      name: 'merch',
      route: '/(tabs)/merch',
      icon: 'bag.fill',
      label: 'Merch',
    },
    // {
    //   name: 'giftcards',
    //   route: '/(tabs)/giftcards',
    //   icon: 'gift.fill',
    //   label: 'Gift Cards',
    // },
    {
      name: 'profile',
      route: '/(tabs)/profile',
      icon: 'person',
      label: 'Profile',
    },
  ];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
      tabBar={() => <FloatingTabBar tabs={tabs} />}
    >
      <Tabs.Screen name="(home)" />
      <Tabs.Screen name="cart" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="merch" />
      {/* <Tabs.Screen name="giftcards" /> */}
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
