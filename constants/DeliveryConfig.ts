
export const RESTAURANT_PICKUP_ADDRESS = {
  name: process.env.RESTAURANT_NAME || 'Jagabans L.A.', // Replace with actual restaurant name
  phoneNumber: process.env.RESTAURANT_PHONE || '+8182106659', // Replace with actual restaurant phone
  address: {
    street: '1423 W Pico Blvd', // Replace with actual address
    city: 'Los Angeles',
    state: 'CA',
    zipCode: '90015',
    country: 'US',
  },
  notes: 'Please call upon arrival',
};

export const UBER_DELIVERY_CONFIG = {
  // Time in minutes to wait before pickup is ready
  pickupReadyDelayMinutes: 0,
  // Time in minutes for estimated dropoff ready time
  dropoffReadyDelayMinutes: 30,
};

export const DOORDASH_DELIVERY_CONFIG = {
  // Time in minutes to wait before pickup is ready
  pickupReadyDelayMinutes: 0,
  // Time in minutes for estimated dropoff ready time
  dropoffReadyDelayMinutes: 30,
};

export type DeliveryProvider = 'uber_direct' | 'doordash';

export const DELIVERY_PROVIDERS = {
  uber_direct: {
    name: 'Uber Direct',
    description: 'Fast and reliable delivery with Uber',
    icon: 'scooter',
  },
  doordash: {
    name: 'DoorDash',
    description: 'Trusted delivery with DoorDash',
    icon: 'truck.box',
  },
};
