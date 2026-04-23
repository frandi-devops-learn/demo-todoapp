const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Todo = sequelize.define('Todo', {
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  completed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  dueDate: {
    type: DataTypes.DATE,
                defaultValue: null,
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  category: {
    type: DataTypes.STRING,
    defaultValue: 'General',
  },
});

module.exports = Todo;