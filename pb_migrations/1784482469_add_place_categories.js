migrate((app) => {
  let places = app.findCollectionByNameOrId("places");

  places.fields.add(new SelectField({
    name: "categories",
    required: false,
    maxSelect: 3,
    values: ["food", "bar", "experience"]
  }));
  app.save(places);

  const records = app.findAllRecords(places);
  records.forEach((record) => {
    const previousCategory = record.getString("type");
    record.set("categories", previousCategory ? [previousCategory] : []);
    app.save(record);
  });

  places = app.findCollectionByNameOrId("places");
  places.fields.getByName("categories").required = true;
  places.fields.removeByName("type");
  app.save(places);
}, (app) => {
  let places = app.findCollectionByNameOrId("places");

  places.fields.add(new SelectField({
    name: "type",
    required: false,
    maxSelect: 1,
    values: ["food", "bar", "experience"]
  }));
  app.save(places);

  const records = app.findAllRecords(places);
  records.forEach((record) => {
    const categories = record.getStringSlice("categories");
    record.set("type", categories[0] || "");
    app.save(record);
  });

  places = app.findCollectionByNameOrId("places");
  places.fields.getByName("type").required = true;
  places.fields.removeByName("categories");
  app.save(places);
});
