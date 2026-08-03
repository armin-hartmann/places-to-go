migrate((app) => {
  const places = app.findCollectionByNameOrId("places");
  places.fields.getByName("categories").values = ["food", "bar", "experience", "cafe", "transportation"];
  app.save(places);
}, (app) => {
  const places = app.findCollectionByNameOrId("places");
  places.fields.getByName("categories").values = ["food", "bar", "experience"];
  app.save(places);
});