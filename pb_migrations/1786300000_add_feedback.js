migrate((app) => {
  const collection = new Collection({
    name: "feedback",
    type: "base",
    listRule: null,
    viewRule: null,
    createRule: "",
    updateRule: null,
    deleteRule: null,
    fields: [
      new TextField({
        name: "message",
        required: true,
        min: 1,
        max: 2000
      }),
      new EmailField({
        name: "email",
        required: false,
        max: 320
      })
    ]
  });
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("feedback");
  app.delete(collection);
});
