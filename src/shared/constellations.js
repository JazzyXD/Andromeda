// Real constellation shapes for courses and guides. Points are [x, y, brightness] in a 240 x 96 box
// (how they're drawn on cards); edges join point indexes in tracing order. `at` places each one in
// the big sky (top-left corner of the box, drawn 3x larger there). Used by both the window and the
// main process, so the same course always gets the same stars everywhere.
(function (root) {
  const COURSE = {
    lyra: { name: 'Lyra', tint: '217,160,102', at: [-600, 300], p: [[70, 26, 1.5], [98, 44], [112, 70], [146, 64], [132, 38]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]] },
    aquila: { name: 'Aquila', tint: '47,127,134', at: [200, 2300], p: [[118, 46, 1.5], [108, 30], [128, 62], [70, 64], [166, 30], [112, 86]], e: [[1, 0], [0, 2], [0, 3], [0, 4], [0, 5]] },
    cassiopeia: { name: 'Cassiopeia', tint: '196,106,143', at: [1700, -300], p: [[52, 38], [86, 64], [120, 44, 1.3], [154, 68], [190, 34]], e: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    perseus: { name: 'Perseus', tint: '120,100,180', at: [2300, 300], p: [[60, 22], [84, 34], [108, 44, 1.4], [136, 40], [160, 52], [148, 78], [120, 70]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 6], [6, 5]] },
    gemini: { name: 'Gemini', tint: '47,127,134', at: [3000, 2600], p: [[78, 18, 1.4], [92, 46], [104, 78], [112, 16, 1.5], [126, 44], [140, 76]], e: [[0, 1], [1, 2], [3, 4], [4, 5], [1, 4]] },
    leo: { name: 'Leo', tint: '217,160,102', at: [4600, 600], p: [[62, 70, 1.5], [60, 48], [72, 30], [92, 24], [104, 38], [150, 46], [188, 60, 1.2], [146, 70]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [6, 7], [7, 0]] },
    cygnus: { name: 'Cygnus', tint: '120,100,180', at: [1200, 1900], p: [[120, 12, 1.5], [120, 44], [120, 86, 1.2], [72, 36], [168, 54]], e: [[0, 1], [1, 2], [3, 1], [1, 4]] },
    scorpius: { name: 'Scorpius', tint: '196,106,143', at: [-700, 2700], p: [[54, 18], [50, 36], [58, 54], [82, 44, 1.5], [98, 56], [112, 72], [134, 82], [160, 84], [180, 74], [176, 58]], e: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9]] },
    andromeda: { name: 'Andromeda', tint: '196,106,143', at: [2400, 1150], p: [[44, 70, 1.3], [84, 56, 1.1], [124, 44, 1.3], [170, 26, 1.2], [112, 30], [104, 16]], e: [[0, 1], [1, 2], [2, 3], [1, 4], [4, 5]] },
    pegasus: { name: 'Pegasus', tint: '47,127,134', at: [3300, -300], p: [[70, 30, 1.2], [130, 30, 1.2], [130, 80, 1.1], [70, 80, 1.2], [180, 70], [200, 52]], e: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4], [4, 5]] },
    bootes: { name: 'Bootes', tint: '217,160,102', at: [5200, -200], p: [[120, 84, 1.6], [100, 58], [108, 30], [124, 14], [142, 30], [146, 58]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]] },
  };

  // Smaller patterns for guide badges (64 x 64 box).
  const GUIDE = {
    delphinus: { name: 'Delphinus', p: [[24, 24], [34, 19], [42, 27], [32, 32, 1.2], [24, 46]], e: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4]] },
    sagitta: { name: 'Sagitta', p: [[12, 42], [26, 35], [40, 28], [54, 21, 1.2], [22, 26]], e: [[0, 1], [1, 2], [2, 3], [1, 4]] },
    triangulum: { name: 'Triangulum', p: [[18, 42], [46, 36], [28, 20, 1.2]], e: [[0, 1], [1, 2], [2, 0]] },
    corvus: { name: 'Corvus', p: [[20, 24, 1.1], [44, 20, 1.1], [48, 42], [22, 46, 1.1], [12, 16]], e: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4]] },
    crux: { name: 'Crux', p: [[32, 12, 1.1], [32, 52, 1.3], [16, 30], [48, 28, 1.1]], e: [[0, 1], [2, 3]] },
    coronaBorealis: { name: 'Corona Borealis', p: [[10, 28], [18, 40], [28, 47], [38, 49], [48, 44], [55, 34], [58, 22]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]] },
  };

  const api = {
    COURSE,
    GUIDE,
    // The first constellation no other course is using, in a fixed order.
    pickForCourse(used) {
      const taken = new Set(used || []);
      const free = Object.keys(COURSE).find((k) => !taken.has(k));
      return free || Object.keys(COURSE)[(taken.size) % Object.keys(COURSE).length];
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AndromedaConstellations = api;
})(typeof window !== 'undefined' ? window : globalThis);
