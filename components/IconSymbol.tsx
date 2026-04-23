// This file is a fallback for using MaterialIcons on Android and web.

import React from "react";
import { SymbolWeight } from "expo-symbols";
import {
  OpaqueColorValue,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

// Add your SFSymbol to MaterialIcons mappings here.
const MAPPING = ({
  // Navigation & Home
  "house.fill": "home",
  "house": "home-outlined",
  "arrow.left": "arrow-back",
  "arrow.right": "arrow-forward",
  "arrow.up": "arrow-upward",
  "arrow.down": "arrow-downward",
  "chevron.left": "chevron-left",
  "chevron.right": "chevron-right",
  "chevron.up": "keyboard-arrow-up",
  "chevron.down": "keyboard-arrow-down",
  "arrow.clockwise": "refresh",
  "arrow.counterclockwise": "refresh",

  // Communication & Social
  "paperplane.fill": "send",
  "paperplane": "send-outlined",
  "envelope.fill": "mail",
  "envelope": "mail-outline",
  "phone.fill": "phone",
  "phone": "phone-outlined",
  "message.fill": "chat",
  "message": "chat-bubble-outline",
  "bell.fill": "notifications",
  "bell": "notifications-none",
  "heart.fill": "favorite",
  "heart": "favorite-border",
  "square.and.arrow.down": "save",

  // Admin Dashboard Specific Icons
  "shield.lefthalf.filled": "admin-panel-settings",
  "shield.checkered": "verified",
  "fork.knife": "restaurant-menu",
  "receipt": "receipt-long",
  "calendar.badge.clock": "event-seat",
  "calendar.badge.exclamationmark": "event-busy",
  "person.2": "people",
  "person.3": "people",
  "calendar": "event",
  "bag": "shopping-bag",
  "giftcard": "card-giftcard",
  "chart.bar": "analytics",
  "truck.box": "local-shipping",
  "dollarsign.circle": "attach-money",
  "chart.line.uptrend.xyaxis": "trending-up",
  "chart.line.downtrend.xyaxis": "trending-down",
  "chart.pie": "pie-chart",
  "chart.bar.doc.horizontal": "bar-chart",
  "table.furniture": "table-restaurant",
	"shield.checkmark.fill": "verified-user",

  // Actions & Controls
  "plus": "add",
  "minus": "remove",
  "xmark": "close",
  "checkmark": "check",
  "checkmark.circle.fill": "check-circle",
  "checkmark.circle": "check-circle-outline",
  "checkmark.square.fill": "check-box",
  "checkmark.square": "check-box-outline-blank",
  "multiply": "clear",
  "trash.fill": "delete",
  "trash": "delete-outline",
  "plus.circle.fill": "add-circle",
  "circle.inset.filled": "radio-button-checked",  // iOS filled circle → checked
  "circle": "radio-button-unchecked",
  "hand.raised.fill": "block",
  "hand.raised": "block",
  "nosign": "block",
  "xmark.octagon.fill": "block",
  "minus.circle.fill": "remove-circle",
  "minus.circle": "remove-circle-outline",
  "xmark.circle.fill": "remove-circle",

  // Editing & Creation
  "pencil": "edit",
  "pencil.and.list.clipboard": "edit-note",
  "square.and.pencil": "edit",
  "doc.text.fill": "description",
  "doc.text": "description",
  "folder.fill": "folder",
  "folder": "folder-open",
  "doc.fill": "insert-drive-file",
  "doc": "insert-drive-file",
  // "calendar": "calendar-today",
  "calendar.circle": "calendar-today",
  "calendar.badge.plus": "calendar-today",
  "doc.on.doc": "content-copy",

  // Media & Content
  "photo.fill": "image",
  "photo": "image-outlined",
  "camera.fill": "camera-alt",
  "camera": "camera-alt",
  "camera.rotate": "flip-camera-ios",
  "video.fill": "videocam",
  "video": "videocam-off",
  "music.note": "music-note",
  "speaker.wave.2.fill": "volume-up",
  "speaker.slash.fill": "volume-off",
  "play.fill": "play-arrow",
  "pause.fill": "pause",
  "stop.fill": "stop",
  "photo.on.rectangle": "add-a-photo",

  // System & Settings
  "gear": "settings",
  "gearshape.fill": "settings",
  "slider.horizontal.3": "tune",
  "info.circle.fill": "info",
  "info.circle": "info-circle",
  "exclamationmark.triangle.fill": "warning",
  "exclamationmark.triangle": "warning-amber",
  "questionmark.circle.fill": "help",
  "questionmark.circle": "help-outline",

  // Shapes & Symbols
  "square": "square",
  "square.grid.3x3": "apps",
  // "circle": "circle",
  "triangle.fill": "change-history",
  "star.fill": "star",
  "star": "star-border",
  "star.circle.fill": "stars",
  "bookmark.fill": "bookmark",
  "bookmark": "bookmark-border",

  // Technology & Code
  "chevron.left.forwardslash.chevron.right": "code",
  "qrcode.viewfinder": "qr-code",
  "wifi": "wifi",
  "antenna.radiowaves.left.and.right": "signal-cellular-alt",
  "battery.100": "battery-full",
  "battery.25": "battery-2-bar",
  "lock.fill": "lock",
  "lock.open.fill": "lock-open",
  "lock.rotation": "lock-reset",
  "dot.radiowaves.left.and.right": "wifi-tethering",

  // Shopping & Commerce
  "cart.fill": "shopping-cart",
  "cart": "shopping-cart-outlined",
  "creditcard.fill": "credit-card",
  "creditcard": "credit-card",
  "dollarsign.circle.fill": "monetization-on",
  "bag.fill": "shopping-bag",
  "gift.fill": "card-giftcard",
  "gift": "card-giftcard",
  "scooter": "delivery-dining",

  // Location & Maps
  "location.fill": "location-on",
  "location": "location-on",
  "map.fill": "map",
  "map": "map",
  "compass.drawing": "explore",

  // Time & Calendar
  "clock.fill": "access-time",
  "clock": "access-time",
  "timer": "timer",

  // User & Profile
  "person": "person",
  "person.fill": "person-add",
  "person.2.fill": "group",
  "person.circle.fill": "account-circle",
  "person.circle": "account-circle",
  "person.crop.circle.fill": "account-circle",
  "person.crop.circle": "account-circle",
  "lock": "lock",
  "person.badge.shield.checkmark": "admin-panel-settings",
  "person.crop.circle.badge.xmark": "person-off",

  // Sharing & Export
  "square.and.arrow.up": "share",
  "square.and.arrow.down.fill": "download",
  "arrow.up.doc.fill": "upload-file",
  "link": "link",

  // Search & Discovery
  "magnifyingglass": "search",
  "line.3.horizontal.decrease": "filter-list",
  "arrow.up.arrow.down": "sort",

  // Visibility & Display
  "eye.fill": "visibility",
  "eye": "visibility",
  "eye.slash.fill": "visibility-off",
  "eye.slash": "visibility-off",
  "lightbulb.fill": "lightbulb",
  "moon.fill": "dark-mode",
  "sun.max.fill": "light-mode",
  "auto.mode": "auto-mode",
  "clock.badge.checkmark": "schedule",

  // Authentication & Security
  "rectangle.portrait.and.arrow.forward": "logout",

  // Fallback mappings (keep existing MaterialIcons names working)
  "receipt-long": "receipt-long",
  "credit-card": "credit-card",
  "event": "event",
  "palette": "palette",
  "logout": "logout",
  "restaurant-menu": "restaurant-menu",
  "event-seat": "event-seat",
  "people": "people",
  // "person.badge.shield.checkmark": "admin-panel-settings",
  "verified": "verified",
  // "bag.fill": "shopping-bag",
  "card-giftcard": "card-giftcard",
  "notifications": "notifications",
  "analytics": "analytics",
  "local-shipping": "local-shipping",
  "attach-money": "attach-money",
  "person-2": "group",
  "person-pin": "person-pin",
  "visibility": "visibility",
  "visibility-off": "visibility-off",
  
  "account-circle": "account-circle",
  "home": "home",
  "settings": "settings",
  "search": "search",
} as unknown) as Record<string, React.ComponentProps<typeof MaterialIcons>["name"]>;

export type IconSymbolName = string;

/**
 * An icon component that uses native SFSymbols on iOS, and MaterialIcons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 *
 * Icon `name`s are based on SFSymbols and require manual mapping to MaterialIcons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  const mappedName = (MAPPING as Record<string, string>)[name] ?? name;

  return (
    <MaterialIcons
      color={color}
      size={size}
      name={mappedName as React.ComponentProps<typeof MaterialIcons>["name"]}
      style={style as StyleProp<TextStyle>}
    />
  );
}