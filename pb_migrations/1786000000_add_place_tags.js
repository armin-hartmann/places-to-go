migrate((app) => {
  const places = app.findCollectionByNameOrId("places");
  places.fields.add(new SelectField({
    name: "tags",
    required: false,
    maxSelect: 8,
    values: [
      "American", "Brunch", "Casual", "Cocktails", "Coffee", "Date night",
      "Family-friendly", "Historic", "Italian", "Japanese", "Late night",
      "Outdoor seating", "Seafood", "Sushi", "Waterfront"
    ]
  }));
  app.save(places);

  const seedTags = {
    "Virtue Feed & Grain": ["American", "Historic"],
    "Captain Gregory's": ["Cocktails", "Late night"],
    "BARCA Pier & Wine Bar": ["Waterfront", "Outdoor seating", "Cocktails"],
    "Torpedo Factory Art Center": ["Historic", "Family-friendly"],
    "Stabler-Leadbeater Apothecary Museum": ["Historic"],
    "Water Taxi": ["Waterfront"]
  };

  app.findAllRecords(places).forEach(record => {
    const tags = seedTags[record.getString("name")];
    if (tags) {
      record.set("tags", tags);
      app.save(record);
    }
  });
}, (app) => {
  const places = app.findCollectionByNameOrId("places");
  places.fields.removeByName("tags");
  app.save(places);
});
