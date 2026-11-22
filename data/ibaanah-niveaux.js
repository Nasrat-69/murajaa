/* Al-Ibaanah : les 8 niveaux après le préparatoire (vides pour l'instant, remplis au fur et à mesure). */
(() => {
  const ORD = ['الأَوَّل', 'الثَّانِي', 'الثَّالِث', 'الرَّابِع', 'الخَامِس', 'السَّادِس', 'السَّابِع', 'الثَّامِن'];
  ORD.forEach((o, i) => (window.DECKS = window.DECKS || []).push({
    id: 'ibaanah-m' + (i + 1), center: 'ibaanah', title: 'المُسْتَوَى ' + o, subtitle: 'Niveau ' + (i + 1), order: i + 1, lessons: []
  }));
})();
