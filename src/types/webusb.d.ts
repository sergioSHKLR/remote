interface USBDeviceFilter {
  vendorId?: number;
  productId?: number;
}

interface USBEndpoint {
  endpointNumber: number;
  direction: "in" | "out";
  type: "bulk" | "interrupt" | "isochronous";
}

interface USBAlternateInterface {
  endpoints: USBEndpoint[];
}

interface USBInterface {
  interfaceNumber: number;
  alternate: USBAlternateInterface;
  alternates: USBAlternateInterface[];
}

interface USBConfiguration {
  configurationValue: number;
  interfaces: USBInterface[];
}

interface USBInTransferResult {
  data?: DataView;
  status: string;
}

interface USBOutTransferResult {
  status: string;
  bytesWritten: number;
}

interface USBDevice {
  readonly productId: number;
  readonly vendorId: number;
  readonly productName?: string;
  readonly opened: boolean;
  readonly configuration: USBConfiguration | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  clearHalt(direction: "in" | "out", endpointNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
  transferIn(endpointNumber: number, length: number): Promise<USBInTransferResult>;
}

interface USB {
  getDevices?(): Promise<USBDevice[]>;
  requestDevice(options: { filters: USBDeviceFilter[] }): Promise<USBDevice>;
  addEventListener(type: "disconnect", listener: (event: USBConnectionEvent) => void): void;
  removeEventListener(type: "disconnect", listener: (event: USBConnectionEvent) => void): void;
}

interface USBConnectionEvent extends Event {
  readonly device: USBDevice;
}

interface Navigator {
  readonly usb: USB;
}
