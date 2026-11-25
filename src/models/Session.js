import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Session = sequelize.define(
  'Session',
  {
    sessionId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('IDLE', 'ACTIVE', 'SAFE', 'SOS'),
      defaultValue: 'IDLE',
      allowNull: false,
    },
    lat: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    lng: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    accuracy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    note: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'sessions',
    timestamps: true, // otomatis membuat createdAt & updatedAt
  }
);

export default Session;