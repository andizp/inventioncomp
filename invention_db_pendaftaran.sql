-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: invention_db
-- ------------------------------------------------------
-- Server version	9.3.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `pendaftaran`
--

DROP TABLE IF EXISTS `pendaftaran`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pendaftaran` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `nama` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `nomor_hp` varchar(50) DEFAULT NULL,
  `indi_kelom` varchar(50) DEFAULT NULL,
  `anggota_kelompok` text,
  `identitas_diri` varchar(100) DEFAULT NULL,
  `bidang` text,
  `nama_produk` varchar(255) DEFAULT NULL,
  `latar_belakang` text,
  `tujuan` text,
  `uraian` text,
  `foto` varchar(255) DEFAULT NULL,
  `foto_identitas` varchar(255) DEFAULT NULL,
  `video_produk` varchar(255) DEFAULT NULL,
  `legalitas` varchar(255) DEFAULT NULL,
  `inovasi_yang_dihasilkan` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `pendaftaran_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pendaftaran`
--

LOCK TABLES `pendaftaran` WRITE;
/*!40000 ALTER TABLE `pendaftaran` DISABLE KEYS */;
INSERT INTO `pendaftaran` VALUES (14,3,'johan','johan123@pelita.ac.id','0899935462','Kelompok','eeeefffff','Surat Keterangan Domisili','Pertanian dan pangan, Energi','papan tulis ajaib','papan tulis menulis sendiri','memudahkan dosen','sepeti itulah','1757407656682.webp','1757407656683.png','aaaaaaaaad','1757407657123.pdf','Sudah Dikomersilkan/Dipasarkan'),(15,2,'wwwwwwwww','Guidogigi402@gmail.com','33333','Kelompok','eeeefffff','KTP','Pertanian dan pangan, Lingkungan Hidup','tompek','papan tulis menulis sendiri','memudahkan dosen','sepeti itulah','1757469065617.png','1757469066136.png','https://www.youtube.com/watch?v=51PTYiY-UlQ&t=361s','1757469066739.webp','Sudah Dikomersilkan/Dipasarkan'),(16,6,'bagas','Guidogigi402@gmail.com','08637721812','Kelompok','bagas, nigga','Kartu Mahasiswa','Kesehatan, Obat-obatan, dan Kosmetika','skincare','kecantikan kulit','menglowingkAN KULIT','sepeti itulah','1757728877569.png','1757728878001.jpeg',NULL,'1757728878282.docx','Sudah Dikomersilkan/Dipasarkan');
/*!40000 ALTER TABLE `pendaftaran` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-09-16 10:03:09
