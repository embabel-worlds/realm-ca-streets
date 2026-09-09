// Test stub of the appliance app runtime — serves canned envelopes shaped
// exactly like live gateway.view.run results captured from the appliance.
window.__viewCalls = [];
window.__canned = {};
window.embabel = {
  manifest: { ready: Promise.resolve({ ok: true }) },
  views: {
    invoke: async (name, args, opts) => {
      window.__viewCalls.push(name);
      if (window.__failViews && window.__failViews.includes(name)) throw new Error('stubbed failure');
      return { status: 'OK', data: window.__canned[name] || [] };
    }
  },
  lenses: { invoke: async () => ({ status: 'OK', data: [] }) },
  createRunner: () => ({}),
  progress: { label: () => {} },
  chat: { session: () => ({ send: async () => {} }), ask: async () => '' }
};
window.gateway = new Proxy({}, {
  get: (t, ns) => new Proxy({}, {
    get: (t2, method) => async (args) => {
      window.__gatewayCalls = window.__gatewayCalls || [];
      window.__gatewayCalls.push(ns + '.' + method);
      if (ns === 'represent' && method === 'representPostcode') {
        return { centroid: { coordinates: [-79.39, 43.64] }, city: 'TORONTO', province: 'ON',
                 boundaries_centroid: [{ boundary_set_name: 'Census subdivision', external_id: '3520005', name: 'Toronto' }],
                 representatives_centroid: [{ elected_office: 'MP', district_name: 'Spadina—Harbourfront', name: 'Chi Nguyen', party_name: 'Liberal' }] };
      }
      if (ns === 'nrcanGeolocator') {
        return [
          { qualifier: 'LOCATION', title: 'Whistler Lake, Digby, Nova Scotia (Lake)', geometry: { coordinates: [-65.8, 44.1] } },
          { qualifier: 'INTERPOLATED_CENTROID', title: 'Whistler Road, Whistler, British Columbia', geometry: { coordinates: [-122.98, 50.09] } },
          { qualifier: 'INTERPOLATED_CENTROID', title: 'Whistler Way, Whistler, British Columbia', geometry: { coordinates: [-122.95, 50.11] } },
          { qualifier: 'INTERPOLATED_CENTROID', title: 'Gateway Drive & Whistler Way, Whistler, British Columbia', geometry: { coordinates: [-122.96, 50.11] } }
        ];
      }
      if (ns === 'repository' && method === 'createEntry') { window.__created = args; return 'ok'; }
      return {};
    }
  })
});
