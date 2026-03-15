export interface SubLocation {
    id: number;
    name: string;
    lat: number;
    lng: number;
    durationMinutes: number;
    description: string;
    adultPrice: number;
    childPrice: number;
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
    transportFare: number;
    accommodationName: string;
    accommodationUrl: string;
    adultPrice: number;
    childPrice: number;
    stayCostPerNight: number;
    foodBudgetPerDay: number;
    adults: number;
    children: number;
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
    transportFare?: number;
    accommodationName?: string;
    accommodationUrl?: string;
    adultPrice?: number;
    childPrice?: number;
    stayCostPerNight?: number;
    foodBudgetPerDay?: number;
    adults?: number;
    children?: number;
    highlight?: string;
    description?: string;
    activities?: string[];
    food?: string[];
}
