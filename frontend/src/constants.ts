export const NUM_SLOTS = 3;

export const MOCK_NODES = [
  { id: 'node-us-east-1a', ip: '10.0.1.14', region: 'us-east', state: 'active' },
  { id: 'node-eu-west-2b', ip: '10.0.4.22', region: 'eu-west', state: 'idle' },
  { id: 'node-ap-east-1c', ip: '10.0.7.05', region: 'ap-east', state: 'offline' },
  { id: 'node-ap-east-1d', ip: '10.0.7.08', region: 'ap-east', state: 'idle' },
  { id: 'node-us-west-1a', ip: '10.0.2.11', region: 'us-west', state: 'idle' }
];

export const PERSONAL_NODES = [
  { id: 'macbook-pro-m2', ip: '192.168.1.5', region: 'local', state: 'active' },
  { id: 'linux-workstation', ip: '10.0.0.24', region: 'remote-wireguard', state: 'idle' }
];
