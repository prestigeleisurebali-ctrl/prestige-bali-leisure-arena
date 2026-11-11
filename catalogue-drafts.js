/* ==================================================================
   CATALOGUE EXPANSION — VERIFICATION QUEUE
   ------------------------------------------------------------------
   Real, publicly known Bali venues and services, identified by name
   and location only. Nothing commercial is invented:

     · net rate and selling rate are 0 (unknown)
     · supplier is "To be contracted"
     · inclusions, facilities, hours and photos are empty
     · status "draft", published false, verification "pending"

   Each record is imported into Product Master as a draft and stays
   off the customer website until an administrator verifies the
   contract, rates, inclusions and photography and publishes it.
   ================================================================== */

/* [name, categoryId, subcategory, destination, exact location, pricing unit, short factual note] */
export const DRAFT_PRODUCTS = [
  /* ---------------- Activities & attractions ---------------- */
  ["Bali Swing Experience", "attractions", "Swings & Viewpoints", "Ubud", "Bongkasa Pertiwi, Abiansemal (north of Ubud)", "person", "Jungle swing park above the Ayung valley. Swing options, packages and inclusions to be confirmed with the operator."],
  ["Tegallalang Rice Terrace", "attractions", "Rice Terraces", "Ubud", "Tegallalang, Gianyar", "person", "Terraced rice fields north of Ubud using the traditional subak irrigation system."],
  ["Sacred Monkey Forest Sanctuary", "attractions", "Nature Parks", "Ubud", "Jl. Monkey Forest, Ubud", "person", "Forest sanctuary and temple complex in central Ubud, home to long-tailed macaques."],
  ["Jatiluwih Rice Terraces", "attractions", "Rice Terraces", "Tabanan", "Jatiluwih, Penebel, Tabanan", "person", "Highland rice terraces forming part of the UNESCO-listed Bali cultural landscape."],
  ["Tanah Lot Temple", "attractions", "Temples", "Tabanan", "Beraban, Kediri, Tabanan", "person", "Sea temple on a rock formation off the south-west coast, known for sunset views."],
  ["Uluwatu Temple & Kecak Fire Dance", "attractions", "Temples", "Uluwatu", "Pecatu, South Kuta", "person", "Clifftop sea temple with an evening Kecak dance performance."],
  ["Lempuyang Temple (Gates of Heaven)", "attractions", "Temples", "East Bali", "Mount Lempuyang, Karangasem", "person", "Temple complex on Mount Lempuyang, known for its split gate framing Mount Agung."],
  ["Ulun Danu Beratan Temple", "attractions", "Temples", "North Bali", "Lake Beratan, Bedugul, Tabanan", "person", "Water temple on the shore of Lake Beratan in the central highlands."],
  ["Besakih Temple", "attractions", "Temples", "East Bali", "Besakih, Rendang, Karangasem", "person", "The largest temple complex in Bali, on the slopes of Mount Agung."],
  ["Tirta Gangga Water Palace", "attractions", "Palaces & Gardens", "East Bali", "Ababi, Abang, Karangasem", "person", "Former royal water palace with pools, fountains and stepping stones."],
  ["Goa Gajah (Elephant Cave)", "attractions", "Temples", "Ubud", "Bedulu, Blahbatuh, Gianyar", "person", "Archaeological site with a carved cave entrance and bathing pools."],
  ["Taman Ayun Temple", "attractions", "Temples", "Tabanan", "Mengwi, Badung", "person", "Royal temple of the former Mengwi kingdom, surrounded by a moat."],
  ["Garuda Wisnu Kencana Cultural Park", "attractions", "Cultural Parks", "Uluwatu", "Ungasan, South Kuta", "person", "Cultural park on the Bukit peninsula with a monumental Garuda Wisnu statue."],
  ["Ubud Palace (Puri Saren Agung)", "attractions", "Palaces & Gardens", "Ubud", "Jl. Raya Ubud, Ubud", "person", "Royal palace in the centre of Ubud, venue for evening traditional dance."],
  ["Campuhan Ridge Walk", "attractions", "Nature Parks", "Ubud", "Campuhan, Ubud", "person", "Ridge path between two river valleys on the western edge of Ubud."],
  ["Tegenungan Waterfall", "attractions", "Waterfalls", "Ubud", "Kemenuh, Sukawati, Gianyar", "person", "Waterfall on the Petanu river south of Ubud."],
  ["Tukad Cepung Waterfall", "attractions", "Waterfalls", "Kintamani", "Tembuku, Bangli", "person", "Waterfall inside a narrow canyon, known for light beams in the morning."],
  ["Sekumpul Waterfall", "attractions", "Waterfalls", "North Bali", "Sekumpul, Sawan, Buleleng", "person", "Cluster of waterfalls in the north, reached on foot through the valley."],
  ["Gitgit Waterfall", "attractions", "Waterfalls", "North Bali", "Gitgit, Sukasada, Buleleng", "person", "Waterfall on the road between the highlands and Singaraja."],
  ["Kanto Lampo Waterfall", "attractions", "Waterfalls", "Ubud", "Beng, Gianyar", "person", "Stepped waterfall cascading over rock terraces east of Ubud."],
  ["Kelingking Beach Viewpoint", "attractions", "Beaches & Viewpoints", "Nusa Penida", "Bunga Mekar, Nusa Penida", "person", "Clifftop viewpoint above a beach framed by a T-shaped headland."],
  ["Broken Beach (Pasih Uug)", "attractions", "Beaches & Viewpoints", "Nusa Penida", "Sakti, Nusa Penida", "person", "Natural arch and enclosed cove on the west coast of Nusa Penida."],
  ["Diamond Beach", "attractions", "Beaches & Viewpoints", "Nusa Penida", "Pejukutan, Nusa Penida", "person", "Beach below a carved cliff staircase on the east coast of Nusa Penida."],
  ["Devil's Tears", "attractions", "Beaches & Viewpoints", "Nusa Lembongan", "Jungutbatu, Nusa Lembongan", "person", "Rocky inlet where swells burst through the coastline."],
  ["Bali Safari Park", "attractions", "Wildlife", "Gianyar", "Jl. Prof. Ida Bagus Mantra, Gianyar", "person", "Wildlife park on the east coast highway. Packages to be confirmed with the operator."],
  ["Bali Bird Park", "attractions", "Wildlife", "Gianyar", "Batubulan, Sukawati, Gianyar", "person", "Aviary park with Indonesian and tropical bird species."],
  ["Waterbom Bali", "watersports", "Water Parks", "Kuta", "Jl. Kartika Plaza, Kuta", "person", "Water park in Kuta with slides and pools. Ticket types to be confirmed."],

  /* ---------------- Tours & excursions ---------------- */
  ["Mount Batur Sunrise Trek", "tours", "Volcano & Rice Terrace", "Kintamani", "Mount Batur, Kintamani, Bangli", "person", "Pre-dawn guided hike to the summit of an active volcano for sunrise."],
  ["Kintamani Volcano & Coffee Plantation Tour", "tours", "Volcano & Rice Terrace", "Kintamani", "Kintamani, Bangli", "person", "Day tour to the Batur caldera viewpoints with a coffee plantation stop."],
  ["East Bali Temples Tour", "tours", "Temple Tours", "East Bali", "Karangasem regency", "person", "Day tour covering temples and water palaces of Karangasem."],
  ["Nusa Penida West Coast Day Tour", "tours", "Island Hopping", "Nusa Penida", "Nusa Penida (west coast)", "person", "Day trip covering the west-coast viewpoints of Nusa Penida."],
  ["Ubud Art Villages Tour", "tours", "Temple Tours", "Ubud", "Celuk, Mas and Batuan, Gianyar", "person", "Tour of the craft villages known for silverwork, woodcarving and painting."],
  ["Lovina Dolphin Watching", "tours", "Wildlife", "North Bali", "Lovina, Buleleng", "person", "Early-morning boat outing off Lovina to watch wild dolphins."],
  ["Menjangan Island Snorkel Tour", "tours", "Island Hopping", "West Bali", "Menjangan Island, West Bali National Park", "person", "Boat excursion to the reef walls around Menjangan Island."],
  ["Sidemen Valley Trek", "tours", "Volcano & Rice Terrace", "Sidemen", "Sidemen, Karangasem", "person", "Guided walk through rice fields and villages of the Sidemen valley."],
  ["Jatiluwih & Tanah Lot Day Tour", "tours", "Temple Tours", "Tabanan", "Tabanan regency", "person", "Day tour combining the Jatiluwih terraces with Tanah Lot at sunset."],
  ["Bedugul Highlands Tour", "tours", "Volcano & Rice Terrace", "North Bali", "Bedugul, Tabanan", "person", "Highland tour around the lakes and temples of Bedugul."],

  /* ---------------- Water sports ---------------- */
  ["Tanjung Benoa Water Sports", "watersports", "Water Activities", "Tanjung Benoa", "Tanjung Benoa, Nusa Dua", "activity", "Water-sports centre area on the Benoa peninsula. Activities to be confirmed with the operator."],
  ["Ayung River White-Water Rafting", "watersports", "Rafting", "Ubud", "Ayung River, Ubud", "person", "Rafting on the Ayung river through the gorges near Ubud."],
  ["Telaga Waja River Rafting", "watersports", "Rafting", "East Bali", "Telaga Waja River, Karangasem", "person", "Rafting on the Telaga Waja river in East Bali."],
  ["USAT Liberty Wreck Dive", "watersports", "Diving", "East Bali", "Tulamben, Karangasem", "dive", "Shore-accessible WWII shipwreck dive site at Tulamben."],
  ["Manta Point Snorkel & Dive", "watersports", "Diving", "Nusa Penida", "Manta Point, Nusa Penida", "person", "Cleaning station off Nusa Penida frequented by manta rays."],
  ["Kuta Beach Surf Lesson", "watersports", "Surfing", "Kuta", "Kuta Beach", "person", "Beginner surf lesson on the beach breaks of Kuta."],
  ["Sanur Stand-Up Paddle", "watersports", "Water Activities", "Sanur", "Sanur Beach", "person", "Paddle boarding on the reef-protected lagoon of Sanur."],
  ["Blue Lagoon Snorkelling", "watersports", "Diving", "East Bali", "Blue Lagoon, Padangbai, Karangasem", "person", "Snorkelling in a sheltered bay next to the Padangbai harbour."],
  ["Amed Coral Garden Snorkel", "watersports", "Diving", "East Bali", "Jemeluk Bay, Amed, Karangasem", "person", "Snorkelling over the coral slopes of Jemeluk Bay."],

  /* ---------------- Beach clubs ---------------- */
  ["Potato Head Beach Club", "dining", "Beach Club", "Seminyak", "Jl. Petitenget, Seminyak", "person", "Beach club on Petitenget beach. Minimum spends and daybed options to be confirmed."],
  ["Finns Beach Club", "dining", "Beach Club", "Canggu", "Berawa Beach, Canggu", "person", "Beach club on Berawa beach. Daybed and package terms to be confirmed."],
  ["KU DE TA", "dining", "Beach Club", "Seminyak", "Jl. Kayu Aya, Seminyak", "person", "Beachfront restaurant and bar in Seminyak."],
  ["Sundays Beach Club", "dining", "Beach Club", "Uluwatu", "Ungasan, South Kuta", "person", "Private beach below the cliffs of Ungasan, reached by inclinator."],
  ["Savaya Bali", "dining", "Beach Club", "Uluwatu", "Pecatu, South Kuta", "person", "Clifftop day club on the Bukit peninsula."],
  ["La Brisa", "dining", "Beach Club", "Canggu", "Echo Beach, Canggu", "person", "Beach club built from reclaimed wood at Echo Beach."],
  ["Single Fin", "dining", "Beach Club", "Uluwatu", "Suluban, Uluwatu", "person", "Clifftop bar overlooking the Uluwatu surf breaks."],
  ["Mrs Sippy", "dining", "Beach Club", "Seminyak", "Seminyak", "person", "Saltwater pool club in Seminyak."],
  ["Atlas Beach Fest", "dining", "Beach Club", "Canggu", "Berawa, Canggu", "person", "Beach club and entertainment venue in Berawa."],
  ["Tropicola Beach Club", "dining", "Beach Club", "Seminyak", "Jl. Kayu Aya, Seminyak", "person", "Beach club on Seminyak beach."],
  ["El Kabron", "dining", "Beach Club", "Uluwatu", "Bingin, Pecatu", "person", "Clifftop restaurant and pool on the Bukit coast."],
  ["Rock Bar at AYANA", "dining", "Beach Club", "Jimbaran", "AYANA Resort, Jimbaran", "person", "Bar built on rocks above the ocean at AYANA. Entry policy to be confirmed."],

  /* ---------------- Dining & restaurants ---------------- */
  ["Locavore NXT", "dining", "Fine Dining & Restaurant", "Ubud", "Ubud", "person", "Fine-dining restaurant in Ubud focused on local ingredients."],
  ["Mozaic", "dining", "Fine Dining & Restaurant", "Ubud", "Jl. Raya Sanggingan, Ubud", "person", "Long-standing fine-dining restaurant in Sanggingan."],
  ["Merah Putih", "dining", "Fine Dining & Restaurant", "Seminyak", "Jl. Petitenget, Seminyak", "person", "Indonesian restaurant in Petitenget."],
  ["Kubu at Mandapa", "dining", "Romantic Dining", "Ubud", "Mandapa, a Ritz-Carlton Reserve, Ubud", "person", "Riverside dining in bamboo cocoons at Mandapa."],
  ["Hujan Locale", "dining", "Fine Dining & Restaurant", "Ubud", "Jl. Sri Wedari, Ubud", "person", "Indonesian restaurant in central Ubud."],
  ["Mama San", "dining", "Fine Dining & Restaurant", "Seminyak", "Jl. Raya Kerobokan, Seminyak", "person", "Pan-Asian restaurant and lounge in Seminyak."],
  ["Ju-Ma-Na", "dining", "Fine Dining & Restaurant", "Uluwatu", "Banyan Tree Ungasan", "person", "Restaurant at Banyan Tree Ungasan."],
  ["Bebek Bengil (Dirty Duck Diner)", "dining", "Experience Dining", "Ubud", "Jl. Hanoman, Ubud", "person", "Ubud restaurant known for crispy duck, seated over rice fields."],
  ["Naughty Nuri's Warung", "dining", "Experience Dining", "Ubud", "Jl. Raya Sanggingan, Ubud", "person", "Casual warung known for pork ribs."],
  ["Jimbaran Bay Seafood Dinner", "dining", "Experience Dining", "Jimbaran", "Muaya Beach, Jimbaran", "person", "Seafood dinner on the sand at the Jimbaran Bay cafés."],
  ["Cuca", "dining", "Fine Dining & Restaurant", "Jimbaran", "Jl. Yoga Perkanthi, Jimbaran", "person", "Tapas-style restaurant in Jimbaran."],

  /* ---------------- Wellness & spa ---------------- */
  ["COMO Shambhala Estate", "wellness", "Retreat Packages", "Ubud", "Begawan, Payangan, Ubud", "package", "Wellness retreat estate above the Ayung river. Programmes to be confirmed."],
  ["Karsa Spa", "wellness", "Spa & Massage", "Ubud", "Jl. Bangkiang Sidem, Ubud", "person", "Spa set among rice fields north of Ubud."],
  ["The Spa at Bulgari Resort Bali", "wellness", "Spa & Massage", "Uluwatu", "Bulgari Resort, Uluwatu", "person", "Resort spa at Bulgari Bali. Access for non-resident guests to be confirmed."],
  ["Mandapa Spa", "wellness", "Spa & Massage", "Ubud", "Mandapa, a Ritz-Carlton Reserve, Ubud", "person", "Spa at Mandapa overlooking the Ayung river."],
  ["Tirta Empul Water Purification (Melukat)", "wellness", "Healing", "Ubud", "Tirta Empul, Tampaksiring", "person", "Traditional purification ritual in the holy spring pools of Tirta Empul."],
  ["The Yoga Barn", "wellness", "Healing", "Ubud", "Jl. Hanoman, Ubud", "class", "Yoga and wellness centre in Ubud."],
  ["Radiantly Alive", "wellness", "Healing", "Ubud", "Jl. Jembawan, Ubud", "class", "Yoga studio in central Ubud."],
  ["Taksu Spa", "wellness", "Spa & Massage", "Ubud", "Jl. Goutama Selatan, Ubud", "person", "Day spa in central Ubud."],
  ["Prana Spa", "wellness", "Spa & Massage", "Seminyak", "The Villas, Seminyak", "person", "Day spa in Seminyak."],
  ["Spa Alila Uluwatu", "wellness", "Spa & Massage", "Uluwatu", "Alila Villas Uluwatu", "person", "Clifftop resort spa. Access for non-resident guests to be confirmed."],

  /* ---------------- Accommodation ---------------- */
  ["Four Seasons Resort Bali at Sayan", "accommodation", "Resort", "Ubud", "Sayan, Ubud", "night", "Resort in the Ayung river valley near Ubud."],
  ["Four Seasons Resort Bali at Jimbaran Bay", "accommodation", "Resort", "Jimbaran", "Jimbaran", "night", "Villa resort on the hillside above Jimbaran Bay."],
  ["Mandapa, a Ritz-Carlton Reserve", "accommodation", "Resort", "Ubud", "Kedewatan, Ubud", "night", "Reserve resort on the Ayung river near Ubud."],
  ["Capella Ubud", "accommodation", "Resort", "Ubud", "Keliki, Tegallalang", "night", "Tented camp resort in the rainforest north of Ubud."],
  ["The Ritz-Carlton, Bali", "accommodation", "Resort", "Nusa Dua", "Sawangan, Nusa Dua", "night", "Beachfront resort in Sawangan, Nusa Dua."],
  ["The St. Regis Bali Resort", "accommodation", "Resort", "Nusa Dua", "Kawasan Pariwisata, Nusa Dua", "night", "Beachfront resort in the Nusa Dua enclave."],
  ["AYANA Resort Bali", "accommodation", "Resort", "Jimbaran", "Jimbaran", "night", "Clifftop resort above Jimbaran."],
  ["Six Senses Uluwatu", "accommodation", "Resort", "Uluwatu", "Pecatu, Uluwatu", "night", "Clifftop resort on the Bukit peninsula."],
  ["Alila Villas Uluwatu", "accommodation", "Resort", "Uluwatu", "Pecatu, Uluwatu", "night", "Clifftop villa resort on the Bukit peninsula."],
  ["Amankila", "accommodation", "Resort", "East Bali", "Manggis, Karangasem", "night", "Resort on the hillside above the Lombok Strait."],
  ["Amandari", "accommodation", "Resort", "Ubud", "Kedewatan, Ubud", "night", "Resort above the Ayung river gorge."],
  ["COMO Uma Ubud", "accommodation", "Boutique Retreats", "Ubud", "Sanggingan, Ubud", "night", "Boutique retreat in Sanggingan."],
  ["Hanging Gardens of Bali", "accommodation", "Boutique Retreats", "Ubud", "Payangan, Ubud", "night", "Resort known for its tiered infinity pool above the jungle."],
  ["The Mulia, Bali", "accommodation", "Resort", "Nusa Dua", "Sawangan, Nusa Dua", "night", "Beachfront resort in Sawangan."],
  ["W Bali – Seminyak", "accommodation", "Hotels", "Seminyak", "Jl. Petitenget, Seminyak", "night", "Beachfront hotel in Seminyak."],
  ["Raffles Bali", "accommodation", "Resort", "Jimbaran", "Jimbaran", "night", "Villa resort above Jimbaran Bay."],
  ["The Oberoi Beach Resort, Bali", "accommodation", "Resort", "Seminyak", "Jl. Kayu Aya, Seminyak", "night", "Beachfront resort in Seminyak."],
  ["Viceroy Bali", "accommodation", "Boutique Retreats", "Ubud", "Petanu valley, Ubud", "night", "Villa resort overlooking the Petanu valley."],
  ["Padma Resort Ubud", "accommodation", "Resort", "Ubud", "Payangan, Ubud", "night", "Resort in the hills of Payangan."],
  ["Jumeirah Bali", "accommodation", "Resort", "Uluwatu", "Pecatu, Uluwatu", "night", "Villa resort on the Bukit peninsula."],

  /* ---------------- Transportation ---------------- */
  ["Fast Boat Sanur – Nusa Penida", "transportation", "Boat & Island Transfer", "Sanur", "Sanur harbour to Nusa Penida", "person", "Scheduled fast-boat crossing. Operator and timetable to be confirmed."],
  ["Fast Boat Sanur – Nusa Lembongan", "transportation", "Boat & Island Transfer", "Sanur", "Sanur harbour to Nusa Lembongan", "person", "Scheduled fast-boat crossing. Operator and timetable to be confirmed."],
  ["Fast Boat to the Gili Islands", "transportation", "Boat & Island Transfer", "East Bali", "Padangbai to Gili Trawangan", "person", "Fast-boat crossing to the Gili Islands. Operator to be confirmed."],
  ["Private Driver — Full Day (10 hours)", "transportation", "Private Chauffeur", "Ubud", "Island-wide", "day", "House service: private car and driver. Vehicle class and rate to be set."],
  ["Private Driver — Half Day (5 hours)", "transportation", "Private Chauffeur", "Ubud", "Island-wide", "half-day", "House service: private car and driver. Vehicle class and rate to be set."],
  ["Airport Transfer — Ngurah Rai to Ubud", "transportation", "Airport Transfer", "Ubud", "I Gusti Ngurah Rai International Airport (DPS)", "vehicle", "House service: arrival transfer. Vehicle class and rate to be set."],
  ["Airport Transfer — Ngurah Rai to Uluwatu", "transportation", "Airport Transfer", "Uluwatu", "I Gusti Ngurah Rai International Airport (DPS)", "vehicle", "House service: arrival transfer. Vehicle class and rate to be set."],

  /* ---------------- Yacht & boat ---------------- */
  ["Bali Hai Lembongan Reef Cruise", "yacht", "Full-Day Charter", "Nusa Lembongan", "Benoa Harbour to Nusa Lembongan", "person", "Day cruise to a reef pontoon off Nusa Lembongan. Packages to be confirmed with the operator."],
  ["Sunset Catamaran Cruise — Benoa Bay", "yacht", "Sunset Charter", "Nusa Dua", "Benoa Harbour", "person", "Sunset cruise departing Benoa Harbour. Operator to be confirmed."],
  ["Private Phinisi Charter — Komodo", "yacht", "Full-Day Charter", "Labuan Bajo", "Labuan Bajo, Flores", "charter", "Multi-day phinisi charter in Komodo National Park. Vessel to be confirmed."],

  /* ---------------- Concierge & special services ---------------- */
  ["Private Photographer Session", "concierge", "Event Production", "Ubud", "Island-wide", "session", "House service: photographer for a holiday or proposal shoot. Rate to be set."],
  ["Villa Pre-Arrival Grocery Stocking", "concierge", "Personal Shopping", "Seminyak", "Island-wide", "service", "House service: villa stocked before arrival from the guest's list."],
  ["In-Villa Nanny", "concierge", "Nanny & Butler", "Seminyak", "Island-wide", "day", "House service: vetted nanny for in-villa childcare. Rate to be set."],
  ["Private Butler", "concierge", "Nanny & Butler", "Uluwatu", "Island-wide", "day", "House service: dedicated butler for the villa stay. Rate to be set."],
  ["Event & Celebration Production", "concierge", "Event Production", "Uluwatu", "Island-wide", "event", "House service: production of weddings, proposals and private events."],
  ["VIP Airport Meet & Greet", "concierge", "Security", "Kuta", "I Gusti Ngurah Rai International Airport (DPS)", "person", "Airport assistance service. Provider and inclusions to be confirmed."],
];

export const DRAFT_DESTINATIONS = [
  ["Tabanan", "Rice terraces and sea temples of the south-west."],
  ["East Bali", "Karangasem — Mount Agung, water palaces and quiet coast."],
  ["Kintamani", "The Batur caldera and the central highlands."],
  ["North Bali", "Lovina, Bedugul and the waterfalls of Buleleng."],
  ["Kuta", "The original beach town, next to the airport."],
  ["Tanjung Benoa", "The water-sports peninsula north of Nusa Dua."],
  ["Nusa Lembongan", "The smaller island across the Badung Strait."],
  ["West Bali", "West Bali National Park and Menjangan Island."],
  ["Gianyar", "The craft villages and wildlife parks east of Ubud."],
];

export const VERIFY_FIELDS = ["Supplier contract", "Net rate", "Selling rate", "Inclusions & exclusions", "Facilities", "Operating hours", "Cancellation terms", "Photography"];
