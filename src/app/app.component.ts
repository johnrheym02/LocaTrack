
import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild
} from '@angular/core';

import {
  IonApp,
  IonContent,
  IonButton,
  IonIcon,
  IonCard,
  IonCardContent,
  IonSpinner,
  IonItem,
  IonLabel,
  IonList,
  IonBadge,
  IonHeader,
  IonToolbar,
  IonAlert
} from '@ionic/angular/standalone';

import { Geolocation, Position } from '@capacitor/geolocation';
import { addIcons } from 'ionicons';

import {
  locateOutline,
  navigateOutline,
  timeOutline,
  trashOutline,
  locationOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  refreshOutline,
  compassOutline,
  shieldCheckmarkOutline,
  mapOutline,
  closeOutline
} from 'ionicons/icons';

import * as L from 'leaflet';

interface LocationAddress {
  street: string;
  barangay: string;
  municipality: string;
  province: string;
  country: string;
}

interface SavedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  distanceFromPrevious: number | null;
  address?: LocationAddress | null;
}

interface NominatimResponse {
  display_name?: string;
  address?: {
    road?: string;
    residential?: string;
    pedestrian?: string;
    footway?: string;
    path?: string;
    service?: string;
    unclassified?: string;

    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    city_district?: string;
    village?: string;
    hamlet?: string;
    locality?: string;
    district?: string;
    borough?: string;

    city?: string;
    town?: string;
    municipality?: string;
    county?: string;

    state?: string;
    province?: string;
    region?: string;
    state_district?: string;
    country?: string;
  };
}

interface PhotonResponse {
  features?: Array<{
    properties?: {
      name?: string;
      street?: string;
      district?: string;
      suburb?: string;
      locality?: string;
      city?: string;
      county?: string;
      state?: string;
      country?: string;
    };
  }>;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    IonApp,
    IonContent,
    IonButton,
    IonIcon,
    IonCard,
    IonCardContent,
    IonSpinner,
    IonItem,
    IonLabel,
    IonList,
    IonBadge,
    IonHeader,
    IonToolbar,
    IonAlert
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {

  @ViewChild('mapElement')
  mapElement?: ElementRef<HTMLDivElement>;

  loading = false;
  addressLoading = false;

  errorMessage = '';
  addressLookupMessage = '';
  mapMessage = '';

  permissionMessage =
    'Your location is requested only when you tap the button.';

  history: SavedLocation[] = [];
  latest: SavedLocation | null = null;

  distanceLabel = '—';

  showClearAlert = false;
  mapVisible = false;

  private map: L.Map | null = null;
  private markerLayer: L.LayerGroup | null = null;
  private lastAddressRequestAt = 0;

  clearAlertButtons = [
    { text: 'Cancel', role: 'cancel' },
    {
      text: 'Clear history',
      role: 'destructive',
      handler: () => this.clearHistory()
    }
  ];

  constructor() {
    addIcons({
      locateOutline,
      navigateOutline,
      timeOutline,
      trashOutline,
      locationOutline,
      checkmarkCircleOutline,
      alertCircleOutline,
      refreshOutline,
      compassOutline,
      shieldCheckmarkOutline,
      mapOutline,
      closeOutline
    });
  }

  ngOnInit(): void {
    try {
      const saved = localStorage.getItem('locatrack-history-v1');

      if (saved) {
        const parsed = JSON.parse(saved) as SavedLocation[];

        if (Array.isArray(parsed)) {
          this.history = parsed.slice(0, 50);
          this.latest = this.history[0] ?? null;
        }
      }
    } catch {
      this.history = [];
      this.latest = null;
    }
  }

  ngOnDestroy(): void {
    this.destroyMap();
  }

  // ==========================================
  // MAP
  // ==========================================

  openMap(): void {
    this.mapVisible = !this.mapVisible;

    if (this.mapVisible) {
      this.mapMessage = 'Loading map...';

      setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.initializeMap();
          });
        });
      }, 350);

    } else {
      this.destroyMap();
      this.mapMessage = '';
    }
  }

  private initializeMap(): void {
    const element = this.mapElement?.nativeElement;

    if (!this.mapVisible || !element) {
      return;
    }

    if (this.map) {
      setTimeout(() => {
        this.map?.invalidateSize(true);
        this.updateMapMarkers();
      }, 250);

      return;
    }

    this.mapMessage = 'Loading map tiles...';

    const startingPosition: L.LatLngExpression = this.latest
      ? [this.latest.latitude, this.latest.longitude]
      : [12.8797, 121.7740];

    try {
      this.map = L.map(element, {
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true
      }).setView(
        startingPosition,
        this.latest ? 17 : 6
      );

      const tileLayer = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
          crossOrigin: true
        }
      );

      tileLayer.on('tileerror', () => {
        this.mapMessage =
          'Map tiles could not load. Check your internet connection.';
      });

      tileLayer.on('tileload', () => {
        this.mapMessage = '';
      });

      tileLayer.addTo(this.map);

      this.markerLayer = L.layerGroup().addTo(this.map);

      setTimeout(() => {
        if (!this.map) return;

        this.map.invalidateSize(true);
        this.updateMapMarkers();

        if (this.latest) {
          this.map.setView(
            [this.latest.latitude, this.latest.longitude],
            17,
            { animate: false }
          );
        }
      }, 400);

    } catch (error) {
      console.error('Leaflet initialization error:', error);

      this.mapMessage =
        'Could not initialize the map. Please close and reopen it.';
    }
  }

  private destroyMap(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.markerLayer = null;
    }
  }

  private updateMapMarkers(): void {
    if (!this.map || !this.markerLayer) {
      return;
    }

    this.markerLayer.clearLayers();

    this.history.forEach((item, index) => {
      const isLatest = index === 0;

      const markerColor = isLatest ? '#2563eb' : '#64748b';
      const markerText = isLatest ? '●' : String(index + 1);

      const markerIcon = L.divIcon({
        className: 'locatrack-map-marker',
        html: `
          <div style="
            width: 36px;
            height: 36px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            background: ${markerColor};
            border: 3px solid white;
            box-shadow: 0 3px 8px rgba(0,0,0,0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
          ">
            <span style="
              color: white;
              font-size: 13px;
              font-weight: 800;
              transform: rotate(45deg);
              line-height: 1;
            ">${markerText}</span>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 34],
        popupAnchor: [0, -32]
      });

      const marker = L.marker(
        [item.latitude, item.longitude],
        { icon: markerIcon }
      );

      let popupContent = `
        <div>
          <strong>${isLatest ? 'Latest location' : 'Saved location'}</strong>
          <br>
          ${this.formatTime(item.timestamp)}
        </div>
      `;

      if (item.address) {
        popupContent += `
          <div style="margin-top:8px">
            <strong>Address</strong><br>
            ${this.escapeHtml(item.address.street)}<br>
            ${this.escapeHtml(item.address.barangay)}<br>
            ${this.escapeHtml(item.address.municipality)}<br>
            ${this.escapeHtml(item.address.province)}<br>
            ${this.escapeHtml(item.address.country)}
          </div>
        `;
      }

      popupContent += `
        <div style="margin-top:8px">
          Latitude: ${this.formatCoordinate(item.latitude)}
          <br>
          Longitude: ${this.formatCoordinate(item.longitude)}
          <br>
          Accuracy: ${this.formatAccuracy(item.accuracy)}
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.addTo(this.markerLayer!);
    });
  }

  centerOnLatest(): void {
    if (!this.latest) {
      return;
    }

    if (!this.map) {
      this.initializeMap();
      return;
    }

    this.map.invalidateSize(true);

    this.map.setView(
      [this.latest.latitude, this.latest.longitude],
      17,
      { animate: false }
    );

    this.updateMapMarkers();
  }

  // ==========================================
  // ADDRESS LOOKUP
  // ==========================================

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => {
      const replacements: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };

      return replacements[character];
    });
  }

  private firstAvailable(...values: (string | undefined)[]): string {
    return values.find(value => value && value.trim())?.trim()
      || 'Not available';
  }

  private firstNonEmpty(...values: (string | undefined)[]): string {
    return values.find(value => value && value.trim())?.trim() || '';
  }

  private async getNominatimAddress(
    latitude: number,
    longitude: number
  ): Promise<LocationAddress> {

    const elapsed = Date.now() - this.lastAddressRequestAt;
    const wait = Math.max(0, 1100 - elapsed);

    if (wait > 0) {
      await new Promise(resolve => setTimeout(resolve, wait));
    }

    this.lastAddressRequestAt = Date.now();

    const url =
      'https://nominatim.openstreetmap.org/reverse' +
      `?format=jsonv2&lat=${latitude}&lon=${longitude}` +
      '&zoom=18&addressdetails=1';

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned HTTP ${response.status}.`);
    }

    const result = await response.json() as NominatimResponse;

    console.log('LocaTrack Nominatim response:', result);

    const address = result.address;

    if (!address) {
      throw new Error('No address details were returned.');
    }

    return {
      street: this.firstNonEmpty(
        address.road,
        address.residential,
        address.pedestrian,
        address.footway,
        address.path,
        address.service,
        address.unclassified
      ),

      barangay: this.firstNonEmpty(
        address.suburb,
        address.neighbourhood,
        address.city_district,
        address.quarter,
        address.village,
        address.hamlet,
        address.locality,
        address.district,
        address.borough
      ),

      municipality: this.firstNonEmpty(
        address.city,
        address.town,
        address.municipality,
        address.county
      ),

      province: this.firstNonEmpty(
        address.province,
        address.state,
        address.region,
        address.state_district
      ),

      country: this.firstNonEmpty(address.country)
    };
  }

  private async getPhotonAddress(
    latitude: number,
    longitude: number
  ): Promise<Partial<LocationAddress>> {

    const url =
      'https://photon.komoot.io/reverse' +
      `?lat=${latitude}&lon=${longitude}&lang=en`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Photon returned HTTP ${response.status}.`);
    }

    const result = await response.json() as PhotonResponse;

    console.log('LocaTrack Photon response:', result);

    const properties = result.features?.[0]?.properties;

    if (!properties) {
      return {};
    }

    return {
      street: this.firstNonEmpty(
        properties.street
      ),

      barangay: this.firstNonEmpty(
        properties.suburb,
        properties.district,
        properties.locality
      ),

      municipality: this.firstNonEmpty(
        properties.city,
        properties.county
      ),

      province: this.firstNonEmpty(
        properties.state
      ),

      country: this.firstNonEmpty(
        properties.country
      )
    };
  }

  private async reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<LocationAddress> {

    let nominatim: LocationAddress = {
      street: '',
      barangay: '',
      municipality: '',
      province: '',
      country: ''
    };

    let photon: Partial<LocationAddress> = {};

    let nominatimError = false;

    try {
      nominatim = await this.getNominatimAddress(
        latitude,
        longitude
      );
    } catch (error) {
      console.error('Nominatim lookup failed:', error);
      nominatimError = true;
    }

    // Only use the second service if street or barangay is missing,
    // or if the first service could not be reached.
    if (
      !nominatim.street ||
      !nominatim.barangay ||
      nominatimError
    ) {
      try {
        photon = await this.getPhotonAddress(
          latitude,
          longitude
        );
      } catch (error) {
        console.error('Photon lookup failed:', error);
      }
    }

    return {
      street: this.firstAvailable(
        nominatim.street,
        photon.street
      ),

      barangay: this.firstAvailable(
        nominatim.barangay,
        photon.barangay
      ),

      municipality: this.firstAvailable(
        nominatim.municipality,
        photon.municipality
      ),

      province: this.firstAvailable(
        nominatim.province,
        photon.province
      ),

      country: this.firstAvailable(
        nominatim.country,
        photon.country
      )
    };
  }

  // ==========================================
  // GET GPS LOCATION
  // ==========================================

  async getLocation(): Promise<void> {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.addressLookupMessage = '';

    try {
      const permission = await Geolocation.checkPermissions();

      if (
        permission.location !== 'granted' &&
        permission.coarseLocation !== 'granted'
      ) {
        const requested = await Geolocation.requestPermissions();

        if (
          requested.location !== 'granted' &&
          requested.coarseLocation !== 'granted'
        ) {
          throw new Error(
            'Location permission was not granted. Allow location access in your phone settings and try again.'
          );
        }
      }

      let position: Position;

      try {
        position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 10000
        });
      } catch {
        position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 20000,
          maximumAge: 30000
        });
      }

      const previous = this.latest;

      const distance = previous
        ? this.haversineMeters(
            previous.latitude,
            previous.longitude,
            position.coords.latitude,
            position.coords.longitude
          )
        : null;

      const entry: SavedLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp || Date.now(),
        distanceFromPrevious: distance,
        address: null
      };

      this.history = [entry, ...this.history].slice(0, 50);
      this.latest = entry;

      this.distanceLabel = distance === null
        ? 'Starting point saved'
        : this.formatDistance(distance);

      this.persistHistory();

      this.permissionMessage = 'GPS location saved on this device.';

      if (this.mapVisible) {
        if (this.map) {
          this.map.invalidateSize(true);

          this.map.setView(
            [entry.latitude, entry.longitude],
            17,
            { animate: false }
          );

          this.updateMapMarkers();

        } else {
          setTimeout(() => {
            this.initializeMap();
          }, 350);
        }
      }

      // Address lookup does not affect GPS saving.
      this.addressLoading = true;
      this.addressLookupMessage =
        'Looking up your street and barangay...';

      try {
        const address = await this.reverseGeocode(
          entry.latitude,
          entry.longitude
        );

        entry.address = address;

        this.history[0] = entry;
        this.latest = entry;

        this.persistHistory();
        this.updateMapMarkers();

        if (
          address.street === 'Not available' &&
          address.barangay === 'Not available'
        ) {
          this.addressLookupMessage =
            'Coordinates saved, but street and barangay were not found in the available map data.';
        } else {
          this.addressLookupMessage =
            'Address lookup completed.';
        }

      } catch (addressError: unknown) {
        console.error('Address lookup error:', addressError);

        this.addressLookupMessage =
          'Address services could not be reached. Your GPS coordinates were still saved.';

      } finally {
        this.addressLoading = false;
      }

    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : 'Could not get your location. Please try again.';

      this.errorMessage = message;

    } finally {
      this.loading = false;
    }
  }

  // ==========================================
  // DISTANCE CALCULATION
  // ==========================================

  private haversineMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {

    const toRadians = (degrees: number) =>
      degrees * Math.PI / 180;

    const earthRadius = 6371000;

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

    return 2 * earthRadius *
      Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  formatDistance(meters: number): string {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }

    return `${(meters / 1000).toFixed(2)} km`;
  }

  formatCoordinate(value: number | undefined): string {
    return value === undefined ? '—' : value.toFixed(6);
  }

  formatTime(timestamp: number): string {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(timestamp));
  }

  formatAccuracy(meters: number): string {
    return `±${Math.round(meters)} m`;
  }

  // ==========================================
  // LOCAL STORAGE
  // ==========================================

  private persistHistory(): void {
    try {
      localStorage.setItem(
        'locatrack-history-v1',
        JSON.stringify(this.history)
      );
    } catch {
      this.errorMessage =
        'Location was read, but your phone could not save the history.';
    }
  }

  clearHistory(): void {
    this.history = [];
    this.latest = null;
    this.distanceLabel = '—';
    this.errorMessage = '';
    this.addressLookupMessage = '';
    this.addressLoading = false;

    localStorage.removeItem('locatrack-history-v1');

    this.markerLayer?.clearLayers();

    if (this.map) {
      this.map.setView(
        [12.8797, 121.7740],
        6,
        { animate: false }
      );
    }

    this.showClearAlert = false;
  }

  openClearAlert(): void {
    this.showClearAlert = true;
  }

  // ==========================================
  // COPY COORDINATES
  // ==========================================

  copyCoordinates(): void {
    if (!this.latest || !navigator.clipboard) {
      this.errorMessage =
        'Clipboard access is unavailable on this device.';
      return;
    }

    navigator.clipboard.writeText(
      `${this.latest.latitude}, ${this.latest.longitude}`
    )
      .then(() => {
        this.permissionMessage = 'Coordinates copied.';
      })
      .catch(() => {
        this.errorMessage =
          'Could not copy coordinates on this device.';
      });
  }

  get previousLocation(): SavedLocation | null {
    return this.history.length > 1 ? this.history[1] : null;
  }
}
