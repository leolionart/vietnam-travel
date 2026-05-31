export interface SubLocation {
    id: number;
    name: string;
    lat: number;
    lng: number;
    durationMinutes: number;
    durationDays: number;
    scheduledDate: string;
    scheduledPeriod: 'morning' | 'afternoon' | '';
    description: string;
    activityType: 'sightseeing' | 'accommodation' | 'food' | 'transport' | 'other';
    transportType?: 'car' | 'bus' | 'train' | 'flight' | 'motorbike' | 'ferry' | 'walking' | 'other' | '';
    pricingMode: 'per_person' | 'per_room' | 'per_group';
    unitPrice: number;
    quantity: number;
    surcharge: number;
    adultPrice: number;
    childPrice: number;
    participantAdults?: number | null;
    participantChildren?: number | null;
}

export interface Plan {
    id: number;
    slug: string;
    name: string;
    dateRange: string;
    locations?: Location[];
}

export interface Location {
    id: number;
    name: string;
    province: string;
    lat: number;
    lng: number;
    dateRange: string;
    duration: number;
    transport: string;
    transportType: string;
    highlight: string;
    description: string;
    activities: string[];
    food: string[];
    vexereUrl: string | null;
    subLocations: SubLocation[];
}

export interface LocationInput {
    name?: string;
    province?: string;
    lat?: number;
    lng?: number;
    arriveAt?: number | null;
    departAt?: number | null;
    durationDays?: number;
    transportType?: string;
    transportLabel?: string;
    highlight?: string;
    description?: string;
    activities?: string[];
    food?: string[];
}
