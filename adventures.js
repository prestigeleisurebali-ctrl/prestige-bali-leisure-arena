/* ==================================================================
   ADVENTURES — Product Master range
   ------------------------------------------------------------------
   Real Bali adventure activities and venues, described factually.
   Arranged privately by Prestige Bali Leisure, so they are sold
   "Price on request": each guest's price, operator, timings and
   inclusions are confirmed in the quotation. No rates, ratings or
   reviews are invented — set a selling rate in Product Master at any
   time and the website shows it instead of "Price on request".
   Photos: Pexels (free licence), representative of the activity.
   ================================================================== */
const px = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1600&h=1066`;
const PRIVATE = " Private arrangement by Prestige Bali Leisure — the operator, pickup time and inclusions are confirmed in your quotation.";

export const ADVENTURE_SUBS = ["Trekking & Volcano", "Rafting & Kayaking", "4x4 & Off-road", "Cycling", "Canyoning & Waterfalls", "Zipline & Treetop", "Paragliding", "Horse Riding", "Ocean Adventure"];

/* convert: an existing (unpublished) verification-queue record with this name is moved into Adventures instead of duplicated */
export const ADVENTURES = [
  { name: "Mount Batur Sunrise Trek", convert: true, sub: "Trekking & Volcano", destination: "Kintamani", location: "Mount Batur, Kintamani, Bangli", unit: "person", duration: "Pre-dawn start · approx. 2 hours to the summit",
    desc: "Guided pre-dawn hike up Mount Batur, an active volcano in the Kintamani caldera, timed to reach the summit for sunrise over Lake Batur and, on clear mornings, Mount Agung and Mount Rinjani on Lombok.", photos: [35335654, 7565966], alt: "Hikers on a volcanic ridge at dawn" },
  { name: "Mount Agung Summit Trek", sub: "Trekking & Volcano", destination: "East Bali", location: "Mount Agung, Karangasem", unit: "person", duration: "Overnight climb · long, steep ascent",
    desc: "Bali's highest volcano and most sacred mountain (3,031 m). A demanding night climb for experienced, fit hikers on the temple routes up its slopes. The mountain closes during major ceremonies and periods of volcanic activity — your concierge confirms the route and conditions before quoting.", photos: [7565966, 39425808], alt: "Sunrise above the clouds from a volcano summit" },
  { name: "Batur Black Lava 4x4 Jeep Tour", sub: "4x4 & Off-road", destination: "Kintamani", location: "Batur caldera, Kintamani, Bangli", unit: "vehicle", capacity: "4 guests per jeep",
    desc: "Open 4x4 jeep ride across the black lava fields left by Mount Batur's eruptions, with sunrise viewpoints in the caldera — an alternative to the sunrise trek for guests who prefer not to climb.", photos: [35894674, 35787849], alt: "Off-road jeeps crossing a volcanic landscape in Indonesia" },
  { name: "Ayung River White-Water Rafting", convert: true, sub: "Rafting & Kayaking", destination: "Ubud", location: "Ayung River, Ubud", unit: "person", duration: "Half day",
    desc: "Rafting through the gorges of the Ayung, Bali's longest river, past rice terraces, waterfalls and rock carvings near Ubud. Suitable for first-timers; minimum age and fitness are confirmed with the operator.", photos: [1615766, 37097434], alt: "Rafters on a jungle river" },
  { name: "Telaga Waja River Rafting", convert: true, sub: "Rafting & Kayaking", destination: "East Bali", location: "Telaga Waja River, Karangasem", unit: "person", duration: "Half day",
    desc: "Rafting on the Telaga Waja river below Mount Agung in East Bali — a livelier, more technical run than the Ayung, through quiet jungle and rice fields.", photos: [37097434, 1615766], alt: "White-water rafting on a fast river" },
  { name: "Lake Batur Kayaking", sub: "Rafting & Kayaking", destination: "Kintamani", location: "Lake Batur, Kintamani, Bangli", unit: "person", duration: "2–3 hours",
    desc: "Paddle across Bali's largest crater lake beneath Mount Batur — often combined with the sunrise trek or the natural hot springs on the lake shore.", photos: [2611696], alt: "Kayaking on a calm lake surrounded by mountains" },
  { name: "Ubud ATV Quad Bike Ride", sub: "4x4 & Off-road", destination: "Ubud", location: "Countryside around Ubud, Gianyar", unit: "person", duration: "Half day",
    desc: "Ride your own quad bike along muddy jungle trails, river crossings, village lanes and rice-field tracks in the countryside around Ubud. Single and tandem bikes available.", photos: [9201993, 5733221], alt: "Quad bike on a muddy off-road trail" },
  { name: "Off-Road Buggy Adventure", sub: "4x4 & Off-road", destination: "Ubud", location: "Countryside around Ubud, Gianyar", unit: "vehicle", capacity: "2 guests per buggy", duration: "Half day",
    desc: "Two-seat off-road buggies through mud tracks, jungle and paddy fields around Ubud — a good choice for couples and families who prefer to ride side by side.", photos: [5733221, 15920488], alt: "Off-road vehicles on a forest trail" },
  { name: "Kintamani Downhill Cycling", sub: "Cycling", destination: "Kintamani", location: "Kintamani ridge to Ubud", unit: "person", duration: "Half day",
    desc: "Start on the Kintamani ridge above the Batur caldera and cycle mostly downhill through villages, family compounds, coffee plantations and rice fields towards Ubud.", photos: [40419278], alt: "Cyclists riding between green rice paddies" },
  { name: "Jatiluwih Rice Terrace Cycling", sub: "Cycling", destination: "Tabanan", location: "Jatiluwih, Penebel, Tabanan", unit: "person", duration: "Half day",
    desc: "Cycle the quiet lanes of the Jatiluwih terraces, part of Bali's UNESCO-listed subak landscape, beneath the slopes of Mount Batukaru.", photos: [40002782], alt: "Cycling a quiet road through rice fields" },
  { name: "Bali Treetop Adventure Park", sub: "Zipline & Treetop", destination: "North Bali", location: "Bali Botanic Garden, Bedugul, Tabanan", unit: "person",
    desc: "Ropes courses, suspension bridges and zip lines strung between the trees of the Bali Botanic Garden in the cool Bedugul highlands, with circuits for children and adults.", photos: [33872465, 32507024], alt: "Zip lining through a forest canopy" },
  { name: "Gitgit Canyoning", sub: "Canyoning & Waterfalls", destination: "North Bali", location: "Gitgit, Sukasada, Buleleng", unit: "person", duration: "Full day",
    desc: "Guided canyoning in the gorges around Gitgit in North Bali: abseiling down waterfalls, natural rock slides and jumps into pools. For confident swimmers.", photos: [26976906, 9141991], alt: "Abseiling beside a waterfall" },
  { name: "Aling-Aling Waterfall Jumps & Slides", sub: "Canyoning & Waterfalls", destination: "North Bali", location: "Sambangan, Sukasada, Buleleng", unit: "person", duration: "Half day",
    desc: "A guided trek to the Aling-Aling waterfall and the neighbouring falls of Sambangan, with natural rock slides and optional jumps into the pools below.", photos: [9141991, 2854162], alt: "Waterfall pouring over mossy rocks" },
  { name: "Beji Guwang Hidden Canyon Trek", sub: "Canyoning & Waterfalls", destination: "Gianyar", location: "Beji Guwang, Sukawati, Gianyar", unit: "person", duration: "2–3 hours",
    desc: "A guided walk and wade through a narrow limestone canyon carved by the river near Sukawati. Expect to get wet; a local guide is required.", photos: [9586392], alt: "River running through a rocky gorge" },
  { name: "Tandem Paragliding at Timbis", sub: "Paragliding", destination: "Uluwatu", location: "Timbis cliffs, Kutuh, South Kuta", unit: "person",
    desc: "Tandem flights with a licensed pilot along the limestone cliffs of the Bukit peninsula at Timbis, weather and wind permitting.", photos: [5303379, 32236492], alt: "Paragliders above sea cliffs" },
  { name: "Beach Horse Riding", sub: "Horse Riding", destination: "Canggu", location: "Seseh and Canggu beaches", unit: "person",
    desc: "Horseback rides along the black-sand beaches and rice fields of Bali's west coast at sunrise or sunset, for beginners and experienced riders.", photos: [17716816, 11289051], alt: "Horse riding on the beach at sunset" },
  { name: "Amed Freediving Introduction", sub: "Ocean Adventure", destination: "East Bali", location: "Amed, Karangasem", unit: "person", duration: "Half day",
    desc: "An introduction to freediving with a certified instructor in the calm, clear bays of Amed — breathing technique, safety and first dives along the reef wall.", photos: [32949983, 3041866], alt: "Freediver in clear blue water" },
].map((a) => ({ ...a, desc: a.desc + PRIVATE, images: a.photos.map((id, i) => ({ url: px(id), caption: a.alt + (i ? "" : ""), kind: i ? "gallery" : "main", credit: "Pexels" })) }));
