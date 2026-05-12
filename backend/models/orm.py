from sqlalchemy import Column, String, Integer
from backend.database import Base


class Job(Base):
    __tablename__ = "jobs"
    id = Column(String, primary_key=True)
